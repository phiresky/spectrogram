// Assumes context is an AudioContext defined outside of this class.

function rerender() {
  console.log("rerender");
  if (this.labels) this.renderAxesLabels();
}
Polymer('g-spectrogram', {
  // Show the controls UI.
  controls: false,
  // Log mode.
  log: false,
  logIntensity: 3,
  // Show axis labels, and how many ticks.
  labels: false,
  minFreq: 4000,
  maxFreq: 16000,
  ticks: 10,
  speed: 2,
  logColor: false,
  // FFT bin size,
  fftsize: 2048,
  oscillator: false,
  color: false,

  attachedCallback: function() {
    this.tempCanvas = document.createElement('canvas'),
    console.log('Created spectrogram');
    // Get input from the microphone.
    if (!navigator.getUserMedia) {
      navigator.getUserMedia = navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
    }
    if (!navigator.getUserMedia) {
        alert("Your browser does not support microphone access. Try Chrome or Firefox");
    }
    var constraints = {
      audio: { optional: [{ echoCancellation: false }] }
    };
    navigator.getUserMedia(constraints,
                           this.onStream.bind(this),
                           this.onStreamError.bind(this));
    this.ctx = this.$.canvas.getContext('2d');
    window.spectrogram = this;
  },

  render: function() {
    //console.log('Render');
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    var didResize = false;
    // Ensure dimensions are accurate.
    if (this.$.canvas.width != this.width) {
      this.$.canvas.width = this.width;
      this.$.labels.width = this.width;
      didResize = true;
    }
    if (this.$.canvas.height != this.height) {
      this.$.canvas.height = this.height;
      this.$.labels.height = this.height;
      didResize = true;
    }

    //this.renderTimeDomain();
    this.renderFreqDomain();

    if (this.labels && didResize) {
      this.renderAxesLabels();
    }

    requestAnimationFrame(this.render.bind(this));

    var now = new Date();
    if (this.lastRenderTime_) {
      this.instantaneousFPS = now - this.lastRenderTime_;
    }
    this.lastRenderTime_ = now;
  },

  renderTimeDomain: function() {
    var times = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(times);

    for (var i = 0; i < times.length; i++) {
      var value = times[i];
      var percent = value / 256;
      var barHeight = this.height * percent;
      var offset = this.height - barHeight - 1;
      var barWidth = this.width/times.length;
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(i * barWidth, offset, 1, 1);
    }
  },
  freqData: null,

  renderFreqDomain: function() {
    if(this.freqData === null) 
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this.freqData);

    var ctx = this.ctx;
    // Copy the current canvas onto the temp canvas.
    this.tempCanvas.width = this.width;
    this.tempCanvas.height = this.height;
    //console.log(this.$.canvas.height, this.tempCanvas.height);
    var tempCtx = this.tempCanvas.getContext('2d');
    tempCtx.drawImage(this.$.canvas, 0, 0, this.width, this.height);

    var minIndex = this.freqToIndex(+this.minFreq);
    var maxIndex = this.freqToIndex(+this.maxFreq);
    // Iterate over the frequencies.
    for (var i = minIndex; i < maxIndex; i++) {
      var value;
      var index = i;
      // Draw each pixel with the specific color
      if (this.log) {
        index = this.logScale(i, maxIndex);
      }
      value = this.freqData[index];

      ctx.fillStyle = (this.color ? this.getFullColor(value) : this.getGrayColor(value));

      var percent = (i - minIndex) / (maxIndex - minIndex);
      var y = Math.round(percent * this.height);

      // draw the line at the right side of the canvas
      ctx.fillRect(this.width - this.speed, 0,
                   this.speed, this.height - y);
    }

    // Translate the canvas.
    ctx.translate(-this.speed, 0);
    // Draw the copied image.
    ctx.drawImage(this.tempCanvas, 0, 0, this.width, this.height,
                  0, 0, this.width, this.height);

    // Reset the transformation matrix.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  /**
   * Given an index and the total number of entries, return the
   * log-scaled value.
   */
  logScale: function(index, total, opt_base) {
    var base = opt_base || 2;
    var logmax = this.logBase(total + 1, base);
    var exp = logmax * index / total;
    return Math.round(Math.pow(base, exp) - 1);
  },

  logBase: function(val, base) {
    return Math.log(val) / Math.log(base);
  },

  renderAxesLabels: function() {
    var canvas = this.$.labels;
    canvas.width = this.width;
    canvas.height = this.height;
    var ctx = canvas.getContext('2d');
    var startFreq = +this.minFreq;
    var nyquist = context.sampleRate/2;
    var endFreq = +this.maxFreq;
    var step = (endFreq - startFreq) / this.ticks;
    var minIndex = this.freqToIndex(+this.minFreq);
    var maxIndex = this.freqToIndex(+this.maxFreq);
    var yLabelOffset = 5;
    // Render the vertical frequency axis.
    for (var i = 0; i <= this.ticks; i++) {
      var freq = startFreq + (step * i);
      // Get the y coordinate from the current label.
      var index = this.freqToIndex(freq);
      var percent = (index - minIndex) / (maxIndex - minIndex);
      var y = (1-percent) * this.height;
      var x = this.width - 60;
      // Get the value for the current y coordinate.
      var label;
      if (this.log) {
        // Handle a logarithmic scale.
        var logIndex = this.logScale(index, maxIndex);
        freq = this.indexToFreq(logIndex);
      }
      var label = this.formatFreq(freq);
      var units = this.formatUnits(freq);
      ctx.font = '16px Inconsolata';
      // Draw the value.
      ctx.textAlign = 'right';
      ctx.fillText(label, x, y + yLabelOffset);
      // Draw the units.
      ctx.textAlign = 'left';
      ctx.fillText(units, x + 10, y + yLabelOffset);
      // Draw a tick mark.
      ctx.fillRect(x + 40, y, 30, 2);
    }
  },

  clearAxesLabels: function() {
    var canvas = this.$.labels;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
  },

  formatFreq: function(freq) {
    return (freq >= 1000 ? (freq/1000).toFixed(1) : Math.round(freq));
  },

  formatUnits: function(freq) {
    return (freq >= 1000 ? 'kHz' : 'Hz');
  },

  indexToFreq: function(index) {
    var nyquist = context.sampleRate/2;
    return nyquist/this.getFFTBinCount() * index;
  },

  freqToIndex: function(frequency) {
    var nyquist = context.sampleRate/2;
    return Math.round(Math.min(1, Math.max(0, frequency/nyquist)) * this.getFFTBinCount());
  },

  getFFTBinCount: function() {
    return this.fftsize / 2;
  },

  onStream: function(stream) {
    var input = context.createMediaStreamSource(stream);
    var analyser = context.createAnalyser();
    analyser.smoothingTimeConstant = 0.2;
    analyser.fftSize = this.fftsize;
    analyser.minDecibels = -80;

    // Connect graph.
    input.connect(analyser);

    this.analyser = analyser;
    // Setup a timer to visualize some stuff.
    this.render();
  },

  onStreamError: function(e) {
    console.error(e);
    alert("Could not access microphone");
  },

  getGrayColor: function(value) {
    var percent = (255 - value) / 255;
    if(this.logColor) percent = Math.expm1(percent * this.logIntensity)/Math.expm1(this.logIntensity);
    return 'rgb(V, V, V)'.replace(/V/g, (percent * 255)|0);
  },


  getFullColor: function(value) {
    var fromH = 0;
    var toH = 240;
    var percent = 1 - value / 255;
    if(this.logColor) percent = Math.expm1(percent * this.logIntensity)/Math.expm1(this.logIntensity);
    var hue = fromH + percent * (toH - fromH);
    return 'hsl(H, 100%, 50%)'.replace(/H/g, hue);
  },

  
  logChanged: rerender,
  minFreqChanged: function(val) {
    if(+val > this.maxFreq) this.maxFreq = +val + 10;
    rerender.call(this);
  },
  maxFreqChanged: function(val) {
    if(+val < this.minFreq) this.minFreq = +val - 10;
    rerender.call(this);
  },
  ticksChanged: rerender,

  labelsChanged: function() {
    if (this.labels) {
      this.renderAxesLabels();
    } else {
      this.clearAxesLabels();
    }
  }
});
