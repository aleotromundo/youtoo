/* YouToo MilkDrop Engine: renderer generativo WebGL2 con feedback persistente. */
(function () {
    'use strict';

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
            float ring=smoothstep(0.055,0.0,abs(fract(r*4.2-uTime*0.08)-0.5)-0.46);
            float filament=pow(max(0.0,0.5+0.5*wave),5.0)*(0.25+1.8*bass);
            float clouds=fbm(q*2.4+vec2(uTime*0.035,-uTime*0.021)+uSeed);
            float tendrils=pow(max(0.0,1.0-abs(sin(spiral*2.0+clouds*3.0))),8.0);
            vec2 prevUv=0.5+(q*0.985+0.5-0.5)*vec2(1.0+0.017*sin(uTime*0.31+mode),1.0);
            prevUv += normalize(p+0.0001)*(-0.004-0.018*energy-0.028*beat);
            prevUv += 0.014*vec2(sin(q.y*5.0+uTime),cos(q.x*5.0-uTime))*intensity;
            vec3 prev=texture(uPrev,fract(prevUv)).rgb;
            float decay=0.955-0.018*beat-0.012*bass;
            prev*=decay;
            vec3 ink=palette(clouds+filament*0.17+uTime*0.025+phase,phase);
            float mask=(0.06+0.20*clouds+0.48*filament+0.25*tendrils+0.34*ring)*(0.55+energy*1.7);
            mask*=smoothstep(1.32,0.05,r);
            vec3 color=prev+ink*mask;
            color+=palette(spiral/TAU+clouds+phase,phase)*ring*(0.12+beat*0.9);
            color+=vec3(0.08,0.15,0.28)*pow(max(0.0,1.0-r),3.0)*(0.2+high);
            outColor=vec4(max(color,0.0),1.0);
        }
    `;

    const DISPLAY_FRAGMENT = `#version 300 es
        precision highp float;
        uniform sampler2D uSceneTex;
        uniform vec2 uResolution;
        uniform float uTime;
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
            float vignette= smoothstep(1.18,0.22,length((uv-0.5)*vec2(uResolution.x/uResolution.y,1.0)));
            vec3 color=mix(c,chroma,0.24+0.18*high)+bloom*(0.12+0.33*mid+0.38*beat);
            color=1.0-exp(-color*(1.18+0.55*bass));
            color=pow(max(color,0.0),vec3(0.88));
            color*=vignette;
            outColor=vec4(color,1.0);
        }
    `;

    class MilkdropEngine {
        constructor(canvas) {
            this.canvas=canvas;
            this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
            if(!this.gl) throw new Error('WebGL2 no disponible');
            this.simProgram=this.program(VERTEX,SIM_FRAGMENT);
            this.displayProgram=this.program(VERTEX,DISPLAY_FRAGMENT);
            this.buffers=[];
            this.readIndex=0;
            this.width=0;
            this.height=0;
            this.analyser=null;
            this.frequency=null;
            this.audio=new Float32Array([0,0,0,0]);
            this.smooth=new Float32Array([0,0,0]);
            this.previousBass=0;
            this.lastBeat=0;
            this.seed=Math.random()*100.0;
            this.scene=new Float32Array([0.5,0.7,0.0,0.8]);
            this.targetScene=new Float32Array(this.scene);
            this.sceneIndex=0;
            this.resize();
        }
        program(vertexSource, fragmentSource) {
            const gl=this.gl;
            const compile=(type,source)=>{ const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader); if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)||'Shader inválido'); return shader; };
            const program=gl.createProgram(); gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource)); gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||'Programa inválido'); return program;
        }
        attachAnalyser(analyser) { this.analyser=analyser; if(analyser) this.frequency=new Uint8Array(analyser.frequencyBinCount); }
        resize() {
            const rect=this.canvas.getBoundingClientRect();
            const ratio=Math.min(1.65,Math.max(1,Number(window.devicePixelRatio)||1));
            const width=Math.max(2,Math.round((rect.width||640)*ratio));
            const height=Math.max(2,Math.round((rect.height||360)*ratio));
            if(width===this.width&&height===this.height) return;
            this.width=width; this.height=height; this.canvas.width=width; this.canvas.height=height;
            const gl=this.gl; this.buffers.forEach((pair)=>{gl.deleteFramebuffer(pair.fbo);gl.deleteTexture(pair.texture);}); this.buffers=[];
            // RGBA8 es renderizable en WebGL2 móvil y escritorio sin depender de extensiones HDR.
            for(let i=0;i<2;i++){ const texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null); const fbo=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0); this.buffers.push({texture,fbo}); }
            gl.bindFramebuffer(gl.FRAMEBUFFER,this.buffers[0].fbo); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER,this.buffers[1].fbo); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,width,height);
        }
        newScene(energy) { this.sceneIndex++; this.seed=(this.seed+17.13+energy*31.7)%999.0; this.targetScene[0]=(this.sceneIndex%7)/7; this.targetScene[1]=0.35+Math.random()*1.15; this.targetScene[2]=Math.random()*6.28; this.targetScene[3]=0.62+Math.random()*0.62; }
        render(time) {
            if(!this.gl) return;
            this.resize();
            const gl=this.gl;
            if(this.analyser&&this.frequency) this.analyser.getByteFrequencyData(this.frequency);
            let low=0,mid=0,high=0;
            if(this.frequency){ const n=this.frequency.length; for(let i=0;i<n*0.09;i++) low+=this.frequency[i]; for(let i=Math.floor(n*0.09);i<n*0.38;i++) mid+=this.frequency[i]; for(let i=Math.floor(n*0.38);i<n*0.82;i++) high+=this.frequency[i]; low/=Math.max(1,n*0.09)*255; mid/=Math.max(1,n*0.29)*255; high/=Math.max(1,n*0.44)*255; }
            this.smooth[0]+=(low-this.smooth[0])*0.2; this.smooth[1]+=(mid-this.smooth[1])*0.14; this.smooth[2]+=(high-this.smooth[2])*0.1;
            const rise=Math.max(0,this.smooth[0]-this.previousBass); this.previousBass=this.smooth[0];
            const beat=rise>0.014&&this.smooth[0]>0.16&&time-this.lastBeat>260?1:0;
            if(beat){this.lastBeat=time; this.newScene(this.smooth[0]+this.smooth[1]);}
            this.audio[0]=this.smooth[0]; this.audio[1]=this.smooth[1]; this.audio[2]=this.smooth[2]; this.audio[3]+=(beat-this.audio[3])*0.3;
            for(let i=0;i<4;i++) this.scene[i]+=(this.targetScene[i]-this.scene[i])*0.012;
            const read=this.buffers[this.readIndex], write=this.buffers[1-this.readIndex];
            gl.bindFramebuffer(gl.FRAMEBUFFER,write.fbo); gl.viewport(0,0,this.width,this.height); gl.useProgram(this.simProgram); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,read.texture); gl.uniform1i(gl.getUniformLocation(this.simProgram,'uPrev'),0); gl.uniform2f(gl.getUniformLocation(this.simProgram,'uResolution'),this.width,this.height); gl.uniform1f(gl.getUniformLocation(this.simProgram,'uTime'),time*0.001); gl.uniform1f(gl.getUniformLocation(this.simProgram,'uSeed'),this.seed); gl.uniform4fv(gl.getUniformLocation(this.simProgram,'uAudio'),this.audio); gl.uniform4fv(gl.getUniformLocation(this.simProgram,'uScene'),this.scene); gl.drawArrays(gl.TRIANGLES,0,3);
            gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,this.width,this.height); gl.useProgram(this.displayProgram); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,write.texture); gl.uniform1i(gl.getUniformLocation(this.displayProgram,'uSceneTex'),0); gl.uniform2f(gl.getUniformLocation(this.displayProgram,'uResolution'),this.width,this.height); gl.uniform1f(gl.getUniformLocation(this.displayProgram,'uTime'),time*0.001); gl.uniform4fv(gl.getUniformLocation(this.displayProgram,'uAudio'),this.audio); gl.drawArrays(gl.TRIANGLES,0,3);
            this.readIndex=1-this.readIndex;
        }
        destroy(){ this.buffers.forEach((pair)=>{this.gl.deleteFramebuffer(pair.fbo);this.gl.deleteTexture(pair.texture);}); this.buffers=[]; }
    }
    window.NowarfyMilkdropEngine=MilkdropEngine;
})();
