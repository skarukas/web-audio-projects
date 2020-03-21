var playButton = document.getElementById("play-button");
var volumeControl = document.getElementById("volume");
volumeControl.addEventListener("input", () => masterGainNode.gain.value = volumeControl.value / maxNumVoices);

// ==== WebAudio Master Objects ====
var audioContext
var audioOn = false;
var masterGainNode;

// startup WebAudio
function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext);
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = volumeControl.value / maxNumVoices;
    masterGainNode.connect(audioContext.destination); // connect to output
    audioOn = true;
}


// ==== Play Button Handlers ====

function play() {
    audioOn || initAudio();
    randomHarmonics(1000); // begin making some sound
    line(masterGainNode.gain, 0, volumeControl.value / 16, 1);
    playButton.innerText = "Stop";
    playButton.onclick = stop;
}
function stop() {
    reset();
    line(masterGainNode.gain, null, 0, 1, () => {
        playButton.innerText = "Play";
        playButton.onclick = play;
    });
}

// A map of active oscillators and their amplitudes, indexed by frequency
// frequency => [Oscillator, Gain]
var oscList = {};

var post = console.log;
// ==== Note On/Off Handlers ====

noteOn = function(f) {
    var index = f.toFixed();
    if (!oscList[index]) {
        // oscillator
        var osc = audioContext.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f;
        
        // envelope
        var oscGain = audioContext.createGain();
        oscGain.connect(masterGainNode);

        osc.connect(oscGain);
        osc.start();

        // force oscillator to stop after 8 seconds
        setTimeout(() => osc.stop(),80000);

        // fade in for 1 sec, random gain, 0.2 <= gain < 1.0
        var gain = 0.8 * Math.random() + 0.2;
        line(oscGain.gain, 0, gain, 2);

        if (Math.random() < 0.2) {
            // 20% chance of random pitch bend -maxBend <= n < maxBend Hz over 10 sec
            var maxBend = 50;
            var bend = f + (Math.random() * 2 * maxBend) - maxBend;
            line(osc.frequency, f, bend, 10);
        }
        oscList[index] = [osc, oscGain]; // index the oscillator by frequency
    }
}

noteOff = function(f) {
    var index = f.toFixed();
    if (oscList[index]) {
        var [osc, oscGain] = oscList[index];
        // fade out for 1 sec then remove the oscillator
        line(oscGain.gain, null, 0, 2, () => {
            osc.stop();
            delete oscList[index];
        });
    }
}

/**
 * Modulates AudioParam `param` from `start` to `end` in `dur` seconds. 
 * When finished, `callback` is executed.
 */
function line(param, start, end, dur, callback) {
    param.value = (start != null)? start : param.value;
    param.linearRampToValueAtTime(end, audioContext.currentTime + dur);
    callback && setTimeout(callback, dur * 1000);
}


/* 
// ==== demo code for playing random frequencies in a certain range ====
var container = document.createElement("div");
container.innerHTML = '<span>Hi freq: </span><input type="range" min="400" max="800" step="1" value="420" id="hi">';
document.querySelector(".controls").appendChild(container);

var hiFreqControl = document.getElementById("hi");
hiFreqControl.addEventListener("input",  () => hi = hiFreqControl.value);

var lo = 400;
var hi = hiFreqControl.value;

function makeNote(freq, ms) {
    noteOn(freq);
    setTimeout(() => noteOff(freq), ms);
}

function rMake(dur) {
    makeNote(randRange(lo, hi), randRange(dur * 5, dur * 7));
    setTimeout(rMake, randRange(dur, dur * 2), dur);
} */