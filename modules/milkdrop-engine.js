/* YouToo MilkDrop Engine: renderer generativo WebGL2 con feedback persistente. */
(function () {
    'use strict';

    // Triángulo fullscreen: cubre el viewport sin crear un quad ni un vertex buffer.
    const VERTEX = `#version 300 es
        precision highp float;
        out vec2 vUv;
        void main() {
            vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
            vUv = p;
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }
    `;

    const SIM_FRAGMENT = `#version 300 es
        precision highp float;
        uniform sampler2D uPrev;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uSeed;
        uniform vec4 uAudio;
        uniform vec4 uScene;
        in vec2 vUv;
        out vec4 outColor;

        #define PI 3.14159265359
        #define TAU 6.28318530718
        mat2 rot(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
        float hash21(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float noise(vec2 p) {
            vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);
        }
        float fbm(vec2 p) {
            float v=0.0, a=0.5;
            for(int i=0;i<4;i++){ v+=a*noise(p); p=rot(0.71)*p*2.03+7.1; a*=0.5; }
            return v;
        }
        vec3 palette(float t, float phase) {
            vec3 a=vec3(0.48,0.32,0.58);
            vec3 b=vec3(0.52,0.38,0.42);
            vec3 c=vec3(1.0,0.86,0.72);
            vec3 d=vec3(0.08,0.23,0.41)+vec3(phase*0.11,0.0,-phase*0.07);
            return a+b*cos(TAU*(c*t+d));
        }
        void main() {
            vec2 uv=vUv;
            vec2 p=(uv-0.5)*vec2(uResolution.x/uResolution.y,1.0);
            float bass=uAudio.x, mid=uAudio.y, high=uAudio.z, beat=uAudio.w;
            float energy=dot(uAudio.xyz,vec3(0.58,0.30,0.12));
            float mode=uScene.x, drift=uScene.y, phase=uScene.z, intensity=uScene.w;
            float r=length(p), angle=atan(p.y,p.x);
            float spin=0.07*sin(uTime*0.17+mode)+0.12*energy+0.21*beat;
            vec2 q=p*rot(spin);
            float spiral=angle+3.2*log(max(r,0.02))+uTime*(0.12+0.18*drift);
            q+=0.055*vec2(cos(spiral*3.0+uTime),sin(spiral*2.0-uTime))* (0.25+mid+beat);
            q+=0.028*vec2(sin(q.y*8.0+uTime*1.4),cos(q.x*7.0-uTime*1.1))*(0.4+high);
            float wave=sin(spiral*5.0-r*20.0-uTime*1.9+mid*3.0);
            float ring=1.0-smoothstep(0.012,0.055,abs(fract(r*4.2-uTime*0.08)-0.5));
            float filament=pow(max(0.0,0.5+0.5*wave),5.0)*(0.25+1.8*bass);
            float clouds=fbm(q*2.4+vec2(uTime*0.035,-uTime*0.021)+uSeed);
            float tendrils=pow(max(0.0,1.0-abs(sin(spiral*2.0+clouds*3.0))),8.0);
            vec2 prevUv=0.5+(q*0.985)*vec2(1.0+0.017*sin(uTime*0.31+mode),1.0);
            prevUv += normalize(p+0.0001)*(-0.004-0.018*energy-0.028*beat);
            prevUv += 0.014*vec2(sin(q.y*5.0+uTime),cos(q.x*5.0-uTime))*intensity;
            vec3 prev=texture(uPrev,fract(prevUv)).rgb;
            float decay=0.91-0.022*beat-0.012*bass;
            prev*=decay;
            vec3 ink=palette(clouds+filament*0.17+uTime*0.025+phase,phase);
            float mask=(0.025+0.085*clouds+0.22*filament+0.12*tendrils+0.16*ring)*(0.42+energy*0.92);
            mask*=1.0-smoothstep(0.05,1.32,r);
            vec3 color=prev+ink*mask;
            color+=palette(spiral/TAU+clouds+phase,phase)*ring*(0.035+beat*0.24);
            color+=vec3(0.03,0.06,0.12)*pow(max(0.0,1.0-r),3.0)*(0.2+high*0.45);
            // El feedback se almacena en RGBA8: limitarlo evita que la imagen se queme a blanco.
            outColor=vec4(clamp(color,0.0,0.88),1.0);
        }
    `;

    const DISPLAY_FRAGMENT = `#version 300 es
        precision highp float;
        uniform sampler2D uSceneTex;
        uniform vec2 uResolution;
        uniform vec4 uAudio;
        in vec2 vUv;
        out vec4 outColor;
        void main() {
            vec2 px=1.0/uResolution;
            vec2 uv=vUv;
            float bass=uAudio.x, mid=uAudio.y, high=uAudio.z, beat=uAudio.w;
            vec2 ca=vec2(0.002+0.009*bass+0.006*beat,0.0);
            vec3 c=texture(uSceneTex,uv).rgb;
            vec3 bloom=texture(uSceneTex,uv+px*vec2(2.0,0.0)).rgb;
            bloom+=texture(uSceneTex,uv-px*vec2(2.0,0.0)).rgb;
            bloom+=texture(uSceneTex,uv+px*vec2(0.0,2.0)).rgb;
            bloom+=texture(uSceneTex,uv-px*vec2(0.0,2.0)).rgb;
            bloom*=0.25;
            vec3 chroma;
            chroma.r=texture(uSceneTex,uv+ca).r;
            chroma.g=c.g;
            chroma.b=texture(uSceneTex,uv-ca).b;
            float radius=length((uv-0.5)*vec2(uResolution.x/uResolution.y,1.0));
            float vignette=1.0-smoothstep(0.22,1.18,radius);
            vec3 color=mix(c,chroma,0.24+0.18*high)+bloom*(0.12+0.33*mid+0.38*beat);
            color=1.0-exp(-color*(1.18+0.55*bass));
            color=pow(max(color,0.0),vec3(0.88));
            color*=vignette;
            outColor=vec4(color,1.0);
        }
    `;

    class MilkdropEngine {
        constructor(canvas) {
            this.canvas = canvas;
            this.gl = canvas.getContext('webgl2', {
                alpha: false,
                antialias: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance'
            });
            if (!this.gl) throw new Error('WebGL2 no disponible');

            this.simProgram = this.program(VERTEX, SIM_FRAGMENT);
            this.displayProgram = this.program(VERTEX, DISPLAY_FRAGMENT);
            this.simUniforms = this.uniforms(this.simProgram, ['uPrev', 'uResolution', 'uTime', 'uSeed', 'uAudio', 'uScene']);
            this.displayUniforms = this.uniforms(this.displayProgram, ['uSceneTex', 'uResolution', 'uAudio']);
            this.buffers = [];
            this.readIndex = 0;
            this.width = 0;
            this.height = 0;
            this.analyser = null;
            this.frequency = null;
            this.previousSpectrum = null;
            this.bandRanges = null;
            this.audio = new Float32Array([0, 0, 0, 0]);
            this.smooth = new Float32Array([0, 0, 0]);
            this.previousBands = new Float32Array([0, 0, 0]);
            this.fluxHistory = new Float32Array(48);
            this.fluxIndex = 0;
            this.fluxCount = 0;
            this.analysisFrames = 0;
            this.beatIntervals = [];
            this.bpm = 0;
            this.beatCount = 0;
            this.beatsAtLastScene = 0;
            this.lastBeatAt = -Infinity;
            this.lastSceneAt = 0;
            this.lastFrameAt = 0;
            this.randomState = Math.floor(Math.random() * 4294967296) >>> 0;
            this.seed = this.randomState / 4294967296;
            this.scene = new Float32Array([0.5, 0.7, 0.0, 0.8]);
            this.targetScene = new Float32Array(this.scene);
            this.sceneIndex = 0;
            this.onSceneChange = null;
            this.contextLost = false;

            canvas.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                this.contextLost = true;
            });
            this.resize();
        }

        program(vertexSource, fragmentSource) {
            const gl = this.gl;
            const compile = (type, source) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    const message = gl.getShaderInfoLog(shader) || 'Shader inválido';
                    gl.deleteShader(shader);
                    throw new Error(message);
                }
                return shader;
            };

            const program = gl.createProgram();
            const vertex = compile(gl.VERTEX_SHADER, vertexSource);
            const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const message = gl.getProgramInfoLog(program) || 'Programa inválido';
                gl.deleteProgram(program);
                throw new Error(message);
            }
            return program;
        }

        uniforms(program, names) {
            const result = {};
            names.forEach((name) => { result[name] = this.gl.getUniformLocation(program, name); });
            return result;
        }

        attachAnalyser(analyser) {
            if (this.analyser === analyser) return;
            this.analyser = analyser || null;
            if (!analyser) {
                this.frequency = null;
                this.previousSpectrum = null;
                this.bandRanges = null;
                return;
            }

            this.smooth.fill(0);
            this.previousBands.fill(0);
            this.audio.fill(0);
            // El smoothing alto del AnalyserNode ocultaba transientes; el motor suaviza por separado.
            try { analyser.smoothingTimeConstant = Math.min(Number(analyser.smoothingTimeConstant) || 0.55, 0.55); } catch (_) {}
            this.frequency = new Uint8Array(analyser.frequencyBinCount);
            this.previousSpectrum = new Float32Array(analyser.frequencyBinCount);
            const binHz = (Number(analyser.context?.sampleRate) || 44100) / (Number(analyser.fftSize) || 2048);
            this.bandRanges = [
                this.frequencyRange(35, 160, binHz),
                this.frequencyRange(160, 2000, binHz),
                this.frequencyRange(2000, 10000, binHz)
            ];
            this.fluxHistory.fill(0);
            this.fluxIndex = 0;
            this.fluxCount = 0;
            this.analysisFrames = 0;
            this.beatIntervals = [];
            this.bpm = 0;
            this.lastBeatAt = -Infinity;
            this.beatCount = 0;
            this.beatsAtLastScene = 0;
        }

        frequencyRange(minHz, maxHz, binHz) {
            const nyquist = binHz * (this.frequency?.length || 1);
            const start = Math.max(1, Math.floor(minHz / binHz));
            const end = Math.min(this.frequency?.length || 1, Math.max(start + 1, Math.ceil(Math.min(maxHz, nyquist) / binHz)));
            return [start, end];
        }

        averageBand(range) {
            const [start, end] = range;
            let total = 0;
            for (let bin = start; bin < end; bin += 1) total += this.frequency[bin];
            return total / Math.max(1, end - start) / 255;
        }

        averageFlux() {
            if (!this.fluxCount) return 0;
            let total = 0;
            for (let index = 0; index < this.fluxCount; index += 1) total += this.fluxHistory[index];
            return total / this.fluxCount;
        }

        updateAudio(time, deltaSeconds) {
            if (!this.analyser || !this.frequency || !this.bandRanges) {
                for (let band = 0; band < 3; band += 1) {
                    this.smooth[band] *= Math.exp(-deltaSeconds / 0.28);
                    this.audio[band] = this.smooth[band];
                }
                this.audio[3] *= Math.exp(-deltaSeconds / 0.16);
                return false;
            }

            this.analyser.getByteFrequencyData(this.frequency);
            const raw = this.bandRanges.map((range) => this.averageBand(range));
            const attack = [0.075, 0.085, 0.055];
            const release = [0.24, 0.23, 0.18];
            for (let band = 0; band < 3; band += 1) {
                const old = this.smooth[band];
                const tau = raw[band] > old ? attack[band] : release[band];
                const alpha = 1.0 - Math.exp(-deltaSeconds / tau);
                this.smooth[band] = old + (raw[band] - old) * alpha;
            }

            let flux = 0;
            let fluxBins = 0;
            for (let bin = 2; bin < this.frequency.length; bin += 1) {
                const value = this.frequency[bin] / 255;
                flux += Math.max(0, value - this.previousSpectrum[bin]);
                this.previousSpectrum[bin] = value;
                fluxBins += 1;
            }
            flux /= Math.max(1, fluxBins);

            const baseline = this.averageFlux();
            const threshold = Math.max(0.0025, baseline * 1.55);
            const bassRise = Math.max(0, this.smooth[0] - this.previousBands[0]);
            const midRise = Math.max(0, this.smooth[1] - this.previousBands[1]);
            const energy = this.smooth[0] * 0.54 + this.smooth[1] * 0.32 + this.smooth[2] * 0.14;
            const instantEnergy = raw[0] * 0.54 + raw[1] * 0.32 + raw[2] * 0.14;
            const cooldown = this.bpm > 0 ? Math.max(250, (60000 / this.bpm) * 0.52) : 280;
            const onset = this.analysisFrames > 2
                && Math.max(energy, instantEnergy * 0.72) > 0.09
                && flux > threshold
                && (bassRise > 0.0015 || midRise > 0.0018 || flux > threshold * 2.2)
                && time - this.lastBeatAt > cooldown;

            this.fluxHistory[this.fluxIndex] = flux;
            this.fluxIndex = (this.fluxIndex + 1) % this.fluxHistory.length;
            this.fluxCount = Math.min(this.fluxHistory.length, this.fluxCount + 1);
            this.analysisFrames += 1;

            if (onset) this.recordOnset(time);
            this.previousBands.set(this.smooth);
            this.audio[0] = this.smooth[0];
            this.audio[1] = this.smooth[1];
            this.audio[2] = this.smooth[2];
            this.audio[3] = Math.max(onset ? 1 : 0, this.audio[3] * Math.exp(-deltaSeconds / 0.16));

            if (onset) {
                this.beatCount += 1;
                const sinceScene = this.beatCount - this.beatsAtLastScene;
                if (sinceScene >= 16 && time - this.lastSceneAt >= 8500) {
                    this.newScene(energy, time);
                    this.beatsAtLastScene = this.beatCount;
                }
            }
            if (energy > 0.14 && time - this.lastSceneAt >= 24000) {
                this.newScene(energy, time);
                this.beatsAtLastScene = this.beatCount;
            }
            return onset;
        }

        recordOnset(time) {
            if (Number.isFinite(this.lastBeatAt)) {
                const interval = time - this.lastBeatAt;
                if (interval >= 300 && interval <= 1500) {
                    this.beatIntervals.push(interval);
                    if (this.beatIntervals.length > 9) this.beatIntervals.shift();
                    const sorted = this.beatIntervals.slice().sort((a, b) => a - b);
                    const median = sorted[Math.floor(sorted.length / 2)];
                    const candidateBpm = 60000 / median;
                    if (candidateBpm >= 40 && candidateBpm <= 200) {
                        this.bpm = this.bpm ? this.bpm * 0.72 + candidateBpm * 0.28 : candidateBpm;
                    }
                }
            }
            this.lastBeatAt = time;
        }

        nextScene() {
            const energy = this.smooth[0] * 0.54 + this.smooth[1] * 0.32 + this.smooth[2] * 0.14;
            this.newScene(energy, this.lastFrameAt || performance.now());
            this.beatsAtLastScene = this.beatCount;
            return this.sceneIndex;
        }

        newScene(energy, time) {
            this.sceneIndex += 1;
            const random = () => {
                this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
                return this.randomState / 4294967296;
            };
            this.seed = random();
            this.targetScene[0] = (this.sceneIndex % 7) / 7;
            this.targetScene[1] = 0.35 + random() * 0.95 + Math.min(0.2, Math.max(0, energy) * 0.2);
            this.targetScene[2] = random() * 6.28;
            this.targetScene[3] = 0.62 + random() * 0.62;
            this.lastSceneAt = Number.isFinite(time) ? time : 0;
            if (typeof this.onSceneChange === 'function') this.onSceneChange(this.sceneIndex);
        }

        resize() {
            if (this.contextLost) return;
            const rect = this.canvas.getBoundingClientRect();
            const ratio = Math.min(1.65, Math.max(1, Number(window.devicePixelRatio) || 1));
            const width = Math.max(2, Math.round((rect.width || 640) * ratio));
            const height = Math.max(2, Math.round((rect.height || 360) * ratio));
            if (width === this.width && height === this.height) return;

            this.width = width;
            this.height = height;
            this.canvas.width = width;
            this.canvas.height = height;
            const gl = this.gl;
            this.buffers.forEach((pair) => {
                gl.deleteFramebuffer(pair.fbo);
                gl.deleteTexture(pair.texture);
            });
            this.buffers = [];

            // RGBA8 es renderizable en WebGL2 móvil y escritorio sin depender de extensiones HDR.
            for (let index = 0; index < 2; index += 1) {
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                const fbo = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                    throw new Error('No se pudo crear el framebuffer del visualizador');
                }
                this.buffers.push({ texture, fbo });
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[0].fbo);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffers[1].fbo);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, width, height);
        }

        render(time) {
            if (this.contextLost) throw new Error('Contexto WebGL perdido');
            this.resize();
            const gl = this.gl;
            const deltaSeconds = this.lastFrameAt ? Math.max(0.001, Math.min(0.1, (time - this.lastFrameAt) / 1000)) : 1 / 60;
            this.lastFrameAt = time;
            this.updateAudio(time, deltaSeconds);

            const sceneAlpha = 1.0 - Math.exp(-deltaSeconds / 1.2);
            for (let index = 0; index < 4; index += 1) {
                this.scene[index] += (this.targetScene[index] - this.scene[index]) * sceneAlpha;
            }

            const read = this.buffers[this.readIndex];
            const write = this.buffers[1 - this.readIndex];
            if (!read || !write) throw new Error('Buffers WebGL no disponibles');

            gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
            gl.viewport(0, 0, this.width, this.height);
            gl.useProgram(this.simProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, read.texture);
            gl.uniform1i(this.simUniforms.uPrev, 0);
            gl.uniform2f(this.simUniforms.uResolution, this.width, this.height);
            gl.uniform1f(this.simUniforms.uTime, time * 0.001);
            gl.uniform1f(this.simUniforms.uSeed, this.seed);
            gl.uniform4fv(this.simUniforms.uAudio, this.audio);
            gl.uniform4fv(this.simUniforms.uScene, this.scene);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.width, this.height);
            gl.useProgram(this.displayProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, write.texture);
            gl.uniform1i(this.displayUniforms.uSceneTex, 0);
            gl.uniform2f(this.displayUniforms.uResolution, this.width, this.height);
            gl.uniform4fv(this.displayUniforms.uAudio, this.audio);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            this.readIndex = 1 - this.readIndex;
        }

        destroy() {
            if (!this.gl || this.contextLost) return;
            this.buffers.forEach((pair) => {
                this.gl.deleteFramebuffer(pair.fbo);
                this.gl.deleteTexture(pair.texture);
            });
            this.buffers = [];
            this.gl.deleteProgram(this.simProgram);
            this.gl.deleteProgram(this.displayProgram);
        }
    }

    window.NowarfyMilkdropEngine = MilkdropEngine;
})();
