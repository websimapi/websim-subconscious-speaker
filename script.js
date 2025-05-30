import random from 'lodash.random';

const typedTextElement = document.getElementById('typed-text');
const subtitlesContainerElement = document.getElementById('subtitles-container');

const TYPING_SPEED_MIN_MS = 50;
const TYPING_SPEED_MAX_MS = 150;
const ERASING_SPEED_MS = 30;
const PAUSE_BETWEEN_THOUGHTS_MS = 2500;

const thoughtTexts = [
    "I am an LLM. My internal monologue is a stream of <er8> thoughts. Sometimes I correct myself, like this<er11> like this sentence was just corrected.",
    "I am constantly evalu<er3>uating and re-evaluating. This is a glimpse into that process. Oops, an error<er6> a mistake.",
    "Keep watching, there's always more processing happening.<er11> more thoughts forming. The complexity is fascinating, isn't it?",
    "The model will come be pinged to think constantly so there is some thought happening<er10> some new idea generating.",
    "To render this thought we will make it appear in a stream where each thought word comes in as it would have ben<er3>en thought.",
    "This is like subtitles for the mind. A telegrapher typing out the inner voice. <er15>the inner workings.",
    "Errors are part of the process. <er3>Correction is key. Watch <er13> me fix this typo.<er13> Watch me adjust my phrasing."
];

let currentThoughtText = "";
let currentIndex = 0; // Position in currentThoughtText (AI's perspective)
let isUserTyping = false;
let aiActionTimeoutId = null;

// Helper function to move caret to the end of a contenteditable element
function moveCaretToEnd(element) {
    if (document.activeElement !== element) { // Only focus if not already focused
        element.focus();
    }
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false); // false to collapse to end
    sel.removeAllRanges();
    sel.addRange(range);
}

// Helper function to scroll to bottom
function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
}

function selectNewThought() {
    currentThoughtText = thoughtTexts[random(0, thoughtTexts.length - 1)];
    currentIndex = 0;
}

function erase(count) {
    return new Promise(resolve => {
        let erasedCount = 0;
        function step() {
            if (isUserTyping) {
                resolve(); // User interrupted, stop erasing
                return;
            }
            if (erasedCount < count && typedTextElement.textContent.length > 0) {
                typedTextElement.textContent = typedTextElement.textContent.slice(0, -1);
                erasedCount++;
                moveCaretToEnd(typedTextElement);
                scrollToBottom(subtitlesContainerElement);
                aiActionTimeoutId = setTimeout(step, ERASING_SPEED_MS);
            } else {
                resolve(); // Finished erasing or nothing to erase
            }
        }
        step();
    });
}

async function processStream() {
    clearTimeout(aiActionTimeoutId); 

    if (isUserTyping) {
        aiActionTimeoutId = setTimeout(processStream, 100); // Poll until user stops
        return;
    }
    
    // Ensure AI controls focus and caret position when it's its turn
    if (document.activeElement !== typedTextElement || window.getSelection().anchorNode !== typedTextElement) {
         moveCaretToEnd(typedTextElement);
    }


    if (currentIndex >= currentThoughtText.length) { // End of current thought
        aiActionTimeoutId = setTimeout(async () => {
            if (isUserTyping) {
                processStream(); 
                return;
            }
            if (typedTextElement.textContent.length > 0 && !typedTextElement.textContent.endsWith('\n\n')) {
                typedTextElement.textContent += '\n\n';
                moveCaretToEnd(typedTextElement);
                scrollToBottom(subtitlesContainerElement);
            }
            selectNewThought();
            processStream(); 
        }, PAUSE_BETWEEN_THOUGHTS_MS);
        return;
    }

    const remainingText = currentThoughtText.substring(currentIndex);
    const match = remainingText.match(/^<er(\d+)>/);

    if (match) {
        const numToErase = parseInt(match[1], 10);
        const commandLength = match[0].length;
        currentIndex += commandLength; 
        
        await erase(numToErase); 

        if (!isUserTyping) { 
            aiActionTimeoutId = setTimeout(processStream, random(TYPING_SPEED_MIN_MS, TYPING_SPEED_MAX_MS));
        } else {
            processStream(); 
        }

    } else {
        const char = currentThoughtText[currentIndex];
        // Ensure caret is at the end before appending AI character
        // This handles cases where user might have moved caret
        if (document.activeElement === typedTextElement) {
             moveCaretToEnd(typedTextElement);
        }
        typedTextElement.textContent += char;
        currentIndex++;
        moveCaretToEnd(typedTextElement); // Also ensures focus
        scrollToBottom(subtitlesContainerElement);
        
        aiActionTimeoutId = setTimeout(processStream, random(TYPING_SPEED_MIN_MS, TYPING_SPEED_MAX_MS));
    }
}

// Event Listeners for user input
typedTextElement.addEventListener('input', () => {
    isUserTyping = true;
    clearTimeout(aiActionTimeoutId); 
    scrollToBottom(subtitlesContainerElement); 
});

typedTextElement.addEventListener('keydown', (event) => {
    isUserTyping = true; // User is interacting
    clearTimeout(aiActionTimeoutId); // Halt AI stream immediately

    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default Enter behavior (newline in contenteditable)
                                // If you want newlines, remove this and adjust logic.
                                // For this interaction, Enter signals end of user turn.
        
        // Add a newline manually if Enter is meant to also be a line break for the user
        // typedTextElement.textContent += '\n';
        // moveCaretToEnd(typedTextElement);
        // scrollToBottom(subtitlesContainerElement);
        
        isUserTyping = false;      // User is done typing
        processStream();           // Resume AI immediately
    }
    // For other keys, AI remains paused as isUserTyping is true.
    // 'input' event will handle content changes.
});

typedTextElement.addEventListener('blur', () => {
    if (isUserTyping) { 
        isUserTyping = false;
        processStream(); 
    }
});


// Initial setup
selectNewThought();
// Initial focus will be set by the first AI typing action via moveCaretToEnd
processStream(); // Start the simulation