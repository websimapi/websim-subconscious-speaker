import random from 'lodash.random';

const subtitlesContainer = document.getElementById('subtitles-container');
const cursorElement = document.getElementById('cursor');

const TYPING_SPEED_MIN_MS = 50;
const TYPING_SPEED_MAX_MS = 150;
const ERASING_SPEED_MS = 30;
const PAUSE_BETWEEN_LLM_SEGMENTS_MS = 2000; // Pause after LLM finishes a segment
const USER_INACTIVITY_DELAY_MS = 3000;

let userIsTyping = false;
let userActivityTimeout = null;
let llmTypingTimeout = null;

let currentLlmSegment = ""; // The current piece of text the LLM is "typing"
let currentLlmSegmentIndex = 0; // Position in currentLlmSegment

const conversationSystemPrompt = {
    role: "system",
    content: "You are the subconscious mind. The provided text is the current state of your thoughts, which may include user contributions. Your task is to **generate only the next immediate part** of this thought stream. Continue naturally, as if user input was your own. Use `<erX>` to denote backspacing X characters before continuing if you wish to simulate self-correction. **Output only the new text to be typed out. Do not repeat any part of the input. Keep your additions brief, like a fragment of a thought, before pausing.** The user might also use <erX> tags. Do not output them literally if you see them in the input. You are generating a continuation."
};

function getSanitizedTextContent(element) {
    const clone = element.cloneNode(true);
    const cursorClone = clone.querySelector('#cursor');
    if (cursorClone) {
        cursorClone.parentNode.removeChild(cursorClone);
    }
    // contenteditable=true often normalizes BRs to \n in textContent.
    // For more complex HTML, manual iteration of childNodes would be needed.
    return clone.textContent || "";
}

async function erase(count) {
    return new Promise(resolve => {
        let erasedCount = 0;
        function step() {
            if (userIsTyping) { // Stop erasing if user starts typing
                resolve();
                return;
            }
            if (erasedCount < count) {
                const lastNode = cursorElement.previousSibling;
                if (lastNode) {
                    if (lastNode.nodeType === Node.TEXT_NODE && lastNode.textContent.length > 0) {
                        lastNode.textContent = lastNode.textContent.slice(0, -1);
                        if (lastNode.textContent.length === 0) {
                            subtitlesContainer.removeChild(lastNode);
                        }
                    } else { // Not a text node or an empty text node (e.g., <br> typed by user)
                        subtitlesContainer.removeChild(lastNode);
                    }
                    erasedCount++;
                    llmTypingTimeout = setTimeout(step, ERASING_SPEED_MS);
                } else { // No more content to erase
                    resolve();
                }
            } else {
                resolve();
            }
        }
        step();
    });
}

async function fetchLlmResponse(contextText) {
    if (userIsTyping) return; // Don't fetch if user is actively typing

    const messages = [
        conversationSystemPrompt,
        { role: "user", content: `Current thought stream (continue this):\n${contextText}` }
    ];

    try {
        const completion = await websim.chat.completions.create({ messages });
        currentLlmSegment = completion.content || ""; // Ensure it's a string
        currentLlmSegmentIndex = 0;

        if (document.activeElement === subtitlesContainer) {
            subtitlesContainer.blur(); // Remove focus to hide native caret if LLM is about to type
        }
        cursorElement.style.display = 'inline'; // Ensure custom cursor is visible

        // Add a leading space if container has text and new segment doesn't start with space/newline
        const existingText = getSanitizedTextContent(subtitlesContainer);
        if (existingText.length > 0 && 
            currentLlmSegment.length > 0 && 
            !/\s$/.test(existingText) && 
            !/^\s/.test(currentLlmSegment) &&
            !existingText.endsWith('\n')) {
            subtitlesContainer.insertBefore(document.createTextNode(' '), cursorElement);
        }
        
        processLlmStream();
    } catch (error) {
        console.error("Error fetching LLM response:", error);
        // Retry or handle error, e.g., type out a default message
        currentLlmSegment = "<er3>Error...retrying...<er13> Awaiting inspiration...";
        currentLlmSegmentIndex = 0;
        processLlmStream();
    }
}

async function processLlmStream() {
    if (userIsTyping) {
        cursorElement.style.display = 'none'; // Hide custom cursor if user took over
        return;
    }
    
    clearTimeout(llmTypingTimeout); // Clear any pending typing step

    cursorElement.style.display = 'inline'; // Make sure custom cursor is visible

    if (currentLlmSegmentIndex >= currentLlmSegment.length) {
        // Finished typing current LLM segment
        llmTypingTimeout = setTimeout(() => {
            if (userIsTyping) return;
            const currentFullText = getSanitizedTextContent(subtitlesContainer);
            let textForLLM = currentFullText;
            
            // Optionally add a visual separator before fetching the next part
            if (textForLLM.length > 0 && !textForLLM.endsWith('\n\n')) {
                 if (!textForLLM.endsWith('\n')) {
                    subtitlesContainer.insertBefore(document.createTextNode('\n'), cursorElement);
                 }
                 subtitlesContainer.insertBefore(document.createTextNode('\n'), cursorElement);
                 textForLLM = getSanitizedTextContent(subtitlesContainer); // update after adding newlines
            }
            fetchLlmResponse(textForLLM);
        }, PAUSE_BETWEEN_LLM_SEGMENTS_MS);
        return;
    }

    const remainingText = currentLlmSegment.substring(currentLlmSegmentIndex);
    const match = remainingText.match(/^<er(\d+)>/);

    if (match) {
        const numToErase = parseInt(match[1], 10);
        const commandLength = match[0].length;
        currentLlmSegmentIndex += commandLength;
        await erase(numToErase); // Wait for erase to complete
        if (userIsTyping) return; // Check again after erase
        llmTypingTimeout = setTimeout(processLlmStream, TYPING_SPEED_MIN_MS); // Continue processing after erase
    } else {
        const char = currentLlmSegment[currentLlmSegmentIndex];
        subtitlesContainer.insertBefore(document.createTextNode(char), cursorElement);
        currentLlmSegmentIndex++;
        llmTypingTimeout = setTimeout(processLlmStream, random(TYPING_SPEED_MIN_MS, TYPING_SPEED_MAX_MS));
    }
     // Scroll to bottom
    subtitlesContainer.scrollTop = subtitlesContainer.scrollHeight;
}

function handleUserInput() {
    userIsTyping = true;
    cursorElement.style.display = 'none'; // Hide custom cursor, native caret will show
    clearTimeout(llmTypingTimeout); // Stop LLM's current typing action
    clearTimeout(userActivityTimeout); // Reset inactivity timer

    userActivityTimeout = setTimeout(handleUserInactive, USER_INACTIVITY_DELAY_MS);
     // Scroll to bottom as user types
    subtitlesContainer.scrollTop = subtitlesContainer.scrollHeight;
}

function handleUserInactive() {
    userIsTyping = false;
    // Don't hide custom cursor here, processLlmStream or fetchLlmResponse will manage it.
    // It's possible the focus is still in the container.
    // fetchLlmResponse will blur if needed.
    const currentText = getSanitizedTextContent(subtitlesContainer);
    fetchLlmResponse(currentText); // Let LLM continue from user's input
}

function initializeApp() {
    subtitlesContainer.appendChild(cursorElement); // Ensure cursor is last
    
    subtitlesContainer.addEventListener('input', handleUserInput);
    
    subtitlesContainer.addEventListener('focus', () => {
        userIsTyping = true; // Explicitly set when focused
        cursorElement.style.display = 'none';
        clearTimeout(llmTypingTimeout);
        // If there's an existing inactivity timeout, clear it, new input will start it.
        clearTimeout(userActivityTimeout); 
    });

    subtitlesContainer.addEventListener('blur', () => {
        // If user blurs and there's no pending activity, and LLM is not typing,
        // it could mean they tabbed out.
        // If userActivityTimeout is running, let it decide.
        // If llmTypingTimeout is running, LLM is active.
        // If neither, and userIsTyping was true, it means they stopped without timer firing.
        // This case is tricky. For now, rely on inactivity timer or next LLM action.
        // The main thing is that if LLM starts typing, it will show its cursor.
    });

    // Start with an initial thought
    fetchLlmResponse("A thought begins... ");
}

initializeApp();