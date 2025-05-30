import random from 'lodash.random';

const typedTextElement = document.getElementById('typed-text');
const cursorElement = document.getElementById('cursor');
const subtitlesContainer = document.getElementById('subtitles-container');

const TYPING_SPEED_MIN_MS = 50;
const TYPING_SPEED_MAX_MS = 150;
const ERASING_SPEED_MS = 30;
const PAUSE_BETWEEN_THOUGHTS_MS = 3000; // Pause after LLM finishes a segment
const USER_IDLE_DELAY_MS = 3000; // Pause after user stops typing

let llmIsTyping = false;
let streamTimeoutId = null;
let userIdleTimeoutId = null;

let currentLlmSegment = "";
let currentLlmSegmentIndex = 0;

let conversationHistory = [
    {
        role: "system",
        content: `You are the Subconscious Speaker, an AI whose inner thoughts are streamed to the user.
Your output is typed character by character. You can use <erN> (e.g., <er5>) to simulate correcting yourself by erasing N characters.
The user can also type, and their text becomes part of your thought stream.
You will receive the current complete text on screen. Your task is to provide ONLY the NEXT segment of text to be typed.
Do NOT repeat any of the provided current text. Your response should be only the NEW characters/commands.
Example: If current text is "The cat sat on the ma", your response might be "t. <er2>mat. Such a fluffy cat."
If the user typed "I like dogs", and the current text is "Thinking about pets... I like dogs", your response could be ", they are very loyal. Not like cats<er13>some cats can be aloof."
Keep thoughts flowing, sometimes fragmented, sometimes short sentences.
Do not use greetings, or directly acknowledge the user. Seamlessly integrate and continue.
Avoid saying "I am an AI". Maintain the persona of a thought stream.
New thoughts can start after a pause, or you can continue the current one.
Ensure responses are purely text and <erN> commands for the typing simulation.
A segment should be relatively short, like one or two sentences or a phrase.
Avoid generating overly long responses. Keep it brief and thought-like.
If the current text is empty, start a new thought.
`
    }
];

function stopLlmTyping() {
    if (streamTimeoutId) clearTimeout(streamTimeoutId);
    streamTimeoutId = null;
    llmIsTyping = false;
    // The cursor's visibility will be managed by the context (user typing vs. LLM typing).
}

async function fetchAndProcessLlmResponse(isUserContinuation = false) {
    stopLlmTyping();
    cursorElement.style.display = 'none'; // Hide cursor during LLM fetch

    let currentScreenText = typedTextElement.textContent;

    // Add a visual separator for new thoughts if not a direct user continuation AND there's existing text.
    if (!isUserContinuation && currentScreenText.length > 0 && !currentScreenText.endsWith('\n\n')) {
        if (!currentScreenText.endsWith('\n')) { // Add one newline if none
           currentScreenText += '\n';
        }
        currentScreenText += '\n'; // Add the second newline for a blank line
        typedTextElement.textContent = currentScreenText;
        scrollToBottom();
    }
    
    const userMessageContent = `Current text on screen is: "${currentScreenText}". Continue the thought stream.`;
    
    conversationHistory.push({ role: "user", content: userMessageContent });
    conversationHistory = conversationHistory.slice(-10); // Keep history bounded

    try {
        const completion = await websim.chat.completions.create({
            messages: conversationHistory,
        });

        const llmResponseText = completion.content;
        conversationHistory.push({ role: "assistant", content: llmResponseText });


        if (!llmResponseText || llmResponseText.trim() === "") {
            console.warn("LLM returned empty or whitespace response. Scheduling next attempt.");
            streamTimeoutId = setTimeout(() => fetchAndProcessLlmResponse(false), PAUSE_BETWEEN_THOUGHTS_MS);
            cursorElement.style.display = ''; // Show cursor during pause
            return;
        }

        currentLlmSegment = llmResponseText;
        currentLlmSegmentIndex = 0;
        llmIsTyping = true;
        cursorElement.style.display = ''; // Show cursor as LLM starts typing
        typeCharacterOrCommand();

    } catch (error) {
        console.error("Error fetching LLM response:", error);
        // Retry after a delay in case of error
        streamTimeoutId = setTimeout(() => fetchAndProcessLlmResponse(false), PAUSE_BETWEEN_THOUGHTS_MS * 2);
        cursorElement.style.display = ''; // Show cursor during pause
    }
}


function erase(count) {
    return new Promise(resolve => {
        let erasedCount = 0;
        function step() {
            if (erasedCount < count && typedTextElement.textContent.length > 0) {
                typedTextElement.textContent = typedTextElement.textContent.slice(0, -1);
                erasedCount++;
                scrollToBottom();
                setTimeout(step, ERASING_SPEED_MS);
            } else {
                resolve();
            }
        }
        step();
    });
}

async function typeCharacterOrCommand() {
    if (!llmIsTyping) return; // Stopped by user input or other logic

    cursorElement.style.display = ''; // Ensure cursor is visible while LLM types

    if (currentLlmSegmentIndex >= currentLlmSegment.length) {
        llmIsTyping = false;
        // Schedule next LLM thought only if user is not currently typing
        if (!userIdleTimeoutId) { // Check if user is not in their idle timeout phase
             streamTimeoutId = setTimeout(() => fetchAndProcessLlmResponse(false), PAUSE_BETWEEN_THOUGHTS_MS);
        }
        return;
    }

    const remainingSegment = currentLlmSegment.substring(currentLlmSegmentIndex);
    const match = remainingSegment.match(/^<er(\d+)>/);

    if (match) {
        const numToErase = parseInt(match[1], 10);
        currentLlmSegmentIndex += match[0].length;
        await erase(numToErase);
    } else {
        typedTextElement.textContent += currentLlmSegment[currentLlmSegmentIndex];
        currentLlmSegmentIndex++;
        scrollToBottom();
    }
    
    streamTimeoutId = setTimeout(typeCharacterOrCommand, random(TYPING_SPEED_MIN_MS, TYPING_SPEED_MAX_MS));
}

function scrollToBottom() {
    subtitlesContainer.scrollTop = subtitlesContainer.scrollHeight;
}

function handleUserInput() {
    stopLlmTyping();
    cursorElement.style.display = 'none'; // User is typing, hide custom cursor

    if (userIdleTimeoutId) clearTimeout(userIdleTimeoutId);
    
    userIdleTimeoutId = setTimeout(() => {
        userIdleTimeoutId = null; // Clear the timeout ID once it has fired
        // Don't add newline if user was last to type.
        fetchAndProcessLlmResponse(true); // True indicates user continuation
    }, USER_IDLE_DELAY_MS);
}

function init() {
    typedTextElement.contentEditable = "plaintext-only"; // Or "true"
    
    typedTextElement.addEventListener('input', handleUserInput);

    typedTextElement.addEventListener('focus', () => {
        // When user focuses to type, ensure LLM is stopped and custom cursor is hidden
        stopLlmTyping(); 
        cursorElement.style.display = 'none';
    });

    typedTextElement.addEventListener('blur', () => {
        // If user blurs and LLM isn't about to type (e.g. during user idle phase),
        // and not actively typing, show custom cursor.
        if (!llmIsTyping && !userIdleTimeoutId) {
             cursorElement.style.display = typedTextElement.textContent.length > 0 ? '' : 'none';
        }
    });
    
    // Initial fetch to start the stream
    fetchAndProcessLlmResponse(false);
}

init();