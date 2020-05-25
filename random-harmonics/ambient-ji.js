// DOM Nodes
const playButton = document.getElementById("play-button");
const volumeControl = document.getElementById("volume");
const limitSlider = document.getElementById("limit");
const limitLabel = document.getElementById("limit-label");
const bendProbabilitySlider = document.getElementById("bend-prob-slider");
const bendProbabilityLabel = document.getElementById("bend-prob-label");
const bendAmountSlider = document.getElementById("bend-amount-slider");
const bendAmountLabel = document.getElementById("bend-amount-label");
const speedSlider = document.getElementById("speed-slider");
const speedLabel = document.getElementById("speed-label");
const minDurLabel = document.getElementById("min-dur-label");
const minDurSlider = document.getElementById("min-dur-slider");
const maxDurLabel = document.getElementById("max-dur-label");
const maxDurSlider = document.getElementById("max-dur-slider");

// Preferences / State
let bendProbability = 0; // 0.0 - 1.0
let maxBend = 0; // Hz
let maxNumVoices = 8;
let JILimit = 5;
let interval = 1; // in seconds
let maxDurScalar = 4;
let minDurScalar = 2;
let stereoWidth = 0.2;
let fundamental;

/**
 * Audio Map
 * 
 * [OscillatorNode -> PanNode -> GainNode]
 * [OscillatorNode -> PanNode -> GainNode]
 * [                ...                  ]     -> BiquadFilterNode -> GainNode -> AudioContext.destination
 * [                ...                  ]
 * 
 */

minDurSlider.addEventListener("input", () => {
    minDurScalar = parseInt(minDurSlider.value);
    minDurLabel.innerText = `Minimum Length: ${minDurSlider.value} x Interval`;
});

maxDurSlider.addEventListener("input", () => {
    maxDurScalar = parseInt(maxDurSlider.value);
    maxDurLabel.innerText = `Maximum Length: ${maxDurSlider.value} x Interval`;
});

bendProbabilitySlider.addEventListener("input", () => {
    bendProbability = parseInt(bendProbabilitySlider.value) / 100;
    bendProbabilityLabel.innerText = `Pitch Bend Probability: ${bendProbabilitySlider.value}%`;
});

bendAmountSlider.addEventListener("input", () => {
    maxBend = parseInt(bendAmountSlider.value);
    bendAmountLabel.innerText = `Max Pitch Bend: ${bendAmountSlider.value} Hz`;
});

speedSlider.addEventListener("change", () => {
    let exp = 50;
    // exponential from 40 to 2000 ms
    interval = 1.96 * (exp**parseFloat(speedSlider.value) - 1) / (exp - 1) + 0.04;
    if (audioOn) {
        clearInterval(timer);
        timer = setInterval(generateNewFrequency, interval * 1000, interval);
    }
    speedLabel.innerText = `Interval: ${(interval * 1000).toFixed()} ms`;
});

limitSlider.addEventListener("input", () => {
    JILimit = parseInt(limitSlider.value);
    limitLabel.innerText = "JI Limit: " + limitSlider.value;
});

// ==== WebAudio Master Objects ====
let audioContext;
let filterNode;
let masterGainNode;
let audioOn = false;
let convolverNode;

/**
 * Start up WebAudio.
 * 
 */
function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext);
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.setValueAtTime(volumeControl.value / maxNumVoices, audioContext.currentTime);

    filterNode = audioContext.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.value = 2500;

    volumeControl.addEventListener("input", () => masterGainNode.gain.setValueAtTime(volumeControl.value / maxNumVoices, audioContext.currentTime));
    
    convolverNode = audioContext.createConvolver();

    // set flag so this function is only triggered once
    audioOn = true;

    // patch audio nodes
    filterNode.connect(masterGainNode).connect(convolverNode).connect(audioContext.destination);

    const request = new XMLHttpRequest();

    request.open('GET', 'RoomConcertHall.ogg', true);

    request.responseType = 'arraybuffer';


    request.onload = function() {
        var audioData = request.response;

        audioContext.decodeAudioData(audioData).then( 
            function(buffer) {
                convolverNode.buffer = buffer;
            }).catch(
            function(e){ 
                console.log("Error with decoding audio data " + e);
            });
    };
/* 
    var request = new AudioFileRequest('./impulses/Hangar.aiff');
    request.onSuccess = function(decoded) {
        console.log(decoded);
        audioContext.decodeAudioData(decoded.channels[0], 
            function(buffer) {
                convolverNode.buffer = buffer;
            }, 
            function(e){ 
                console.log("Error with decoding audio data " + e.err);
            });
    }
    request.onFailure = function() {
        console.log("Error with decoding audio data " + e.err);
    } */
    request.send();

}

/**
 * A map of active frequencies, oscillators, and gains, stored in a triple and indexed by quarter-tone pitch (number).
 * `number` => `[number, OscillatorNode, GainNode]`
 */
const oscMap = new Map();
let timer;
let timer2;

// ==== Play Button Handlers ====

/**
 * Begin to play audio and schedule notes.
 */
function play() {

    // turn on the audio if it's not already on
    audioOn || initAudio();

    // turn on the timer(s)
    timer = setInterval(generateNewFrequency, interval * 1000, interval);
    timer2 = setInterval(generateNewFrequency, 2000, 2);
    //timer3 = setInterval(generateNewFrequency, 500, 0.5);

    // fade in master volume
    line(masterGainNode.gain, 0, volumeControl.value / 16, 0.3);

    // change the button display
    playButton.innerText = "Stop";
    playButton.style.backgroundColor = "rgb(202, 12, 37)";
    playButton.onclick = stop;
}

/**
 * Stop playing sound, stop scheduling notes, and reset the tonality (`oscMap`).
 * 
 */
function stop() {
    clearInterval(timer);

    // change the button display
    playButton.innerText = "Stopping...";
    playButton.onclick = null;

    // fade out master volume...
    line(masterGainNode.gain, null, 0, 1, () => {

        // ...then turn off all oscillators and clear `oscMap`
        stopAllNotes();

        // change the button display
        playButton.innerText = "Play";
        playButton.style.backgroundColor = "rgb(12, 164, 202)";
        playButton.onclick = play;
    });
}

/**
 * Turn off all oscillators and clear them from the global `oscMap`.
 */
function stopAllNotes() {
    for (let [f, osc, gain] of oscMap.values()) {
        osc.stop();
    }
    oscMap.clear();
}

/**
 * Find the GCD of an array of integers.
 * 
 * @param arr Number[]
 */
function gcdReduce(arr, e = 0) {
    if (arr.length == 0) return 1;

    let curr = arr[0];
    for (let i = 1; i < arr.length; i++) {
        curr = gcd(curr, arr[i], e);
    }
    return curr;

    /**
     * GCD algorithm that stops at a certain epsilon value.
     * */
    function gcd(a, b, e = 0) {
        let R;
        while ((a % b) > e)  {
            R = a % b;
            a = b;
            b = R;
        }
        return b;
    }
}

/**
 * Add a new partial to the existing set of frequencies.
 * @param { Number } interval The number of ms between each attack.
 */
function generateNewFrequency(interval) {
    if (oscMap.size == maxNumVoices) return;
    
    let f;
    let tries = 0; // count attempts so that if there are a lot of freqs and no space, no note is added

    // calculate fundamental (approx. GCD)
    // if there are no freqs, GCD = "fundamental" = 1, and a semirandom freq is created
    let freqs = Array.from(oscMap.values()).map((arr) => arr[0]);
    let newFundamental = gcdReduce(freqs, 10);

    // if last one is suspected as a floating point error, discard it
    if (!fundamental || newFundamental > 50) {
        fundamental = newFundamental;
    }

    do {
        // generate a random partialNum and octave transposition
        let partialNum = randInt(1, JILimit + 1) * randInt(1, JILimit);
        let octave = randInt(-4, 5);

        // calculate this frequency, clamp it, and round it
        f = fundamental * partialNum * 2**octave;
        f = clampFreq(f);
        tries++;
        if (tries == 20) return;
    } while (oscMap.has(QTIndex(f))); 

    // play it back
    let dur = randFloat(interval * minDurScalar, interval * (maxDurScalar + 1));
    let gain = 0.8 * Math.random() + 0.2;
    let pan = Math.random() * 2 * stereoWidth - stereoWidth;
    let envelope = new ADSR(interval, 0.1, 1, interval * 2);
    // Fade in for 2 sec, random gain, 0.2 <= gain < 1.0
    playNote(f, dur, gain, envelope, pan);
}

/**
 * Play back a note through the WebAudio API.
 * 
 * 
 * @param { Number } f   The frequency of the note.
 * @param { Number } dur The duration (in seconds) of the note.
 * @param { Number } maxGain The peak of the envelope.
 * @param { ADSR } envelope The ADSR envelope.
 * @param { Number } pan Stereo pan amount, -1 to 1 (L to R)
 */
function playNote(f, dur, maxGain, envelope, pan) {
    // create oscillator
    let osc = audioContext.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    osc.start();
    
    // create individual gain for enveloping
    let oscGain = audioContext.createGain();

    // create pan and set value
    let oscPan = audioContext.createPanner();
    oscPan.panningModel = 'HRTF';
    oscPan.setPosition(pan, 0, 1 - Math.abs(pan));

    let begin = audioContext.currentTime;
    let end = audioContext.currentTime + dur;

    // ==== Gain Envelope ====
    envelope.start(oscGain.gain, 0, maxGain, begin);
    envelope.stop(oscGain.gain,  0,          end, () => {
        oscMap.delete(QTIndex(f));
    });
    osc.stop(end + envelope.release);
    
    // ==== Frequency Envelope ====
    // Possible random pitch bend -maxBend <= n < maxBend Hz over the note's duration
    if (Math.random() < bendProbability) {
        let bend = (Math.random() * 2 * maxBend) - maxBend;
        line(osc.frequency, f, f + bend, dur + envelope.release);
    }

    // index the oscillator by quarter tone pitch (prevents small dissonances due to miscalculation)
    oscMap.set(QTIndex(f), [f, osc, oscGain]);

    // patch together the audio nodes
    osc.connect(oscPan).connect(oscGain).connect(filterNode);
}

/**
 * Converts a frequency to a quarter tone index 0-120 corresponding to 128-4096 Hz
 */
function QTIndex(f) {
    return Math.round(24 * Math.log(f / 128) / Math.log(2));
}

class ADSR {
    /**
     * Create a multipurpose ADSR envelope with which to modulate an `AudioParam` object.
     * 
     * @param { Number } attack   The duration (in seconds) of the attack portion of the envelope.
     * @param { Number } decay    The duration (in seconds) of the decay portion of the envelope.
     * @param { Number } sustain  The level at which to sustain (between 0. and 1.) after the decay.
     * @param { Number } release  The duration (in seconds) of the release portion of the envelope.
     */
    constructor(attack, decay, sustain, release) {
        this.attack = attack;   // seconds
        this.decay = decay;     // seconds
        this.sustain = sustain; // value 0.0 - 1.0
        this.release = release; // seconds
    }
    /**
     * Schedule the 'note-on' (attack / decay / sustain) portion of the ADSR envelope.
     * 
     * @param { AudioParam } param  The 'AudioParam' object to molulate.
     * @param { Number }     minVal The value from which to begin the envelope.
     * @param { Number }     maxVal The maximum value of the envelope (e.g. value before decay).
     * @param { Number }     begin  The `AudioContext` time (in seconds) at which to begin.
     * 
     * @return                      The ADSR object (`this`), to enable chaining.
     */
    start(param, minVal, maxVal, begin) {
        param.setValueAtTime(minVal, begin); // hacky way to add an instantaneous event
        param.linearRampToValueAtTime(maxVal,                begin + this.attack); // attack
        param.linearRampToValueAtTime(this.sustain * maxVal, begin + this.attack + this.decay); // decay
        return this;
    }
    /**
     * Schedule the 'note-off' (release) portion of the ADSR envelope.
     * 
     * @param { AudioParam } param    The 'AudioParam' object to molulate.
     * @param { Number }     minVal   The value to which the envelope should release.
     * @param { Number }     begin    The `AudioContext` time (in seconds) at which to begin.
     * @param { Function }   callback (optional) A function to execute after the release of the envelope.
     * 
     * @return { Number }             The id of the JS timer that schedules the execution of `callback`. 
     */
    stop(param, minVal, begin, callback = null) {
        param.cancelScheduledValues(begin); // stop envelopes
        param.linearRampToValueAtTime(minVal, begin + this.release); // complete release
        // fire callback after release is completed
        let endTime = (begin - audioContext.currentTime) + this.release;
        let timeout = (callback)? setTimeout(callback, endTime * 1000) : 0;
        return timeout;
    }
}

/**
 * Modulates `AudioParam` `param` from `start` to `end` in `dur` seconds. 
 * When finished, `callback` is executed.
 */
function line(param, start = param.value, end, dur, callback) {
    param.value = start;
    //param.setValueAtTime(start, audioContext.currentTime); // hacky way to add an instantaneous event
    param.linearRampToValueAtTime(end, audioContext.currentTime + dur);
    callback && setTimeout(callback, dur * 1000);
}

/**
 * Generate a random floating-point number in the interval `[a, b)`. 
 * The function is overloaded to use the interval `[0, a)` if `b` is not specified.
 * 
 * @param { Number } a Minimum value of the random number, or, if `b` is unspecified, the maximum value.
 * @param { Number } b Maximum value of the random number, exclusive.
 */
function randFloat(a, b = null) {
    if (b == null) b = a, a = 0;
    return Math.random() * (b - a) + a;
}

/**
 * Generate a random integer in the interval `[a, b)`. 
 * The function is overloaded to use the interval `[0, a)` if `b` is not specified.
 * 
 * @param { Number } a Minimum value of the random integer, or, if `b` is unspecified, the maximum value.
 * @param { Number } b Maximum value of the random integer, exclusive.
 */
function randInt(a, b = null) {
    return Math.floor(randFloat(a, b));
}

/**
 * Bring a frequency into a certain range by transposing it by octaves.
 * Specifically, the interval is [`minFreq`, `2**numOctaves`), which by default is [128, 1024).
 * 
 * @param { Number } freq A frequency in Hertz to clamp.
 * @param { Number } minFreq The minimum frequency allowable.
 * @param { Number } numOctaves The width, in octaves, of the clamped space.
 * 
 */
function clampFreq(freq, minFreq = 128, numOctaves = 3) {
    // [log pitch] Get the floating-point number of octaves from the minimum frequency
    let octavesFromMin = Math.log(freq / minFreq) / Math.log(2);
    // [log pitch] "Transpose" down to the range [0, numOctaves)
    let clampedOctaves = ((octavesFromMin % numOctaves) + numOctaves) % numOctaves;
    // [frequency] "Add" it, as a frequency ratio, to minFreq
    return Math.pow(2, clampedOctaves) * minFreq;
}

/**
 * Round a number to a certain number of decimal places.
 * 
 * @param { Number } n 
 * @param { Number } places 
 */
function round(n, places) {
    let scalar = 10**places;
    return Math.round(n * scalar) / scalar;
}