var freqs;
var currTask;
var noteDuration;
var maxNumVoices = 16;
var JILimit = 9;

function randomHarmonics(speed) {
    noteDuration = speed || noteDuration;
    reset();
    currTask = setInterval(addFreq, speed);
}

function reset() {
    freqs = [];
    if (currTask) {
        if (currTask.cancel) currTask.cancel(); // Max/MSP Task object 
        else clearInterval(currTask);           // browser interval
    }
}

// ====== polyfill for Max/MSP =======
var setInterval = setInterval || function(fn, ms) {
    var t = new Task(fn);
    t.interval = ms;
    t.repeat();
    return t;
}
var setTimeout = setTimeout || function(fn, ms) {
    var t = new Task(fn);
    t.repeat(0, ms);
}

// ====== Max/MSP JS object output =======
function noteOn(f) {
    typeof outlet === 'undefined' || outlet(0, f, 60);
}
function noteOff(f) {
    typeof outlet === 'undefined' || outlet(0, f, 0);
}

// 
function addFreq() {
    if (freqs.length == maxNumVoices) return;

    // create a random harmonic of the other pitches' fundamental
    var f;
    if (freqs.length) {
        var fundamental = gcdReduce(freqs);
        var partialNum = randInt(1, JILimit + 1);

        f = clampFreq(fundamental * partialNum * 2**randInt(-4, 4));
        //if (fundamental < 10) post("ERROR!");
    } else {
        // if no pitches already exist, generate a random one 1024 <= n < 2048
        f = randInt(128, 2056);
    }
    // turn the note on for a certain amount of time then cancel it
    freqs.push(f);
    noteOn(f);
    setTimeout(removeFreq, randRange(noteDuration * 2, noteDuration * 5));

    function removeFreq() {
        freqs = freqs.filter(function(freq) {
            return freq != f;
        });
        noteOff(f);
    }
}

// I know this function doesn't make any sense. 
// But trust me, it transposes any freq to be between 128 and 2056 Hz
function clampFreq(n) {
    return Math.pow(2, (Math.log(n) / Math.log(2) % 4) + 7);
}

// find gcd of an array
function gcdReduce(arr) {
    var curr = arr[0];
    for (var i = 1; i < arr.length; i++) {
        curr = gcd(curr, arr[i]);
    }
    return curr;
}

// gcd algorithm that kinda works for floating point numbers
function gcd(a, b) {
    var R;
    var e = 0.1;
    while ((a % b) > e)  {
        R = a % b;
        a = b;
        b = R;
    }
    return b;
}

// generates a random decimal number between lo and hi
function randRange(lo, hi) {
    return lo + Math.random() * (hi - lo);
}

// generate a random integer LESS THAN max
function randInt(min, max) {
    return Math.floor(Math.random() * Math.floor(max - min)) + min;
}