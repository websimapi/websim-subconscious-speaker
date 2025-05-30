import random from 'lodash.random';

const typedTextElement = document.getElementById('typed-text');
const cursorElement = document.getElementById('cursor');

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
    "Errors are part of the process. <er3>Correction is key. Watch <erN> me fix this typo.<er13> Watch me adjust my phrasing." // <erN> was a placeholder, actual example is <er13>
];

let currentThoughtText = "";
let currentIndex = 0; // Position in currentThoughtText

function selectNewThought() {
    currentThoughtText = thoughtTexts[random(0, thoughtTexts.length - 1)];
    currentIndex = 0;
    typedTextElement.textContent = ''; // Clear previous text
}

function erase(count) {
    return new Promise(resolve => {
        let erasedCount = 0;
        function step() {
            if (erasedCount < count && typedTextElement.textContent.length > 0) {
                typedTextElement.textContent = typedTextElement.textContent.slice(0, -1);
                erasedCount++;
                setTimeout(step, ERASING_SPEED_MS);
            } else {
                resolve();
            }
        }
        step();
    });
}

async function processStream() {
    if (currentIndex >= currentThoughtText.length) {
        await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_THOUGHTS_MS));
        selectNewThought();
        // Fall through to schedule next processing tick
        setTimeout(processStream, random(TYPING_SPEED_MIN_MS, TYPING_SPEED_MAX_MS));
        return;
    }

    cursorElement.style.display = ''; // Ensure cursor is visible while typing/erasing

    const remainingText = currentThoughtText.substring(currentIndex);
    const match = remainingText.match(/^<er(\d+)>/);

    if (match) {
        const numToErase = parseInt(match[1], 10);
        const commandLength = match[0].length;
        currentIndex += commandLength;
        await erase(numToErase); // Wait for erase to complete
    } else {
        const char = currentThoughtText[currentIndex];
        typedTextElement.textContent += char;
        currentIndex++;
    }
    
    setTimeout(processStream, random(TYPING_SPEED_MIN_MS, TYPING_SPEED_MAX_MS));
}

// Initial setup
selectNewThought();
processStream(); // Start the simulation

