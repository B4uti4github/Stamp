// Choppy
class ChScene {
    constructor(name, scene, init, end) {
        this.name = name;
        this.sceneScript = scene || function() {};
        this.initScript = init || function() {};
        this.endScript = end || function() {};
        
        this.i = 0;
        this.active = true; 
        this.clampPause = true;
    }

    step() {
        if (this.i === 0) {
            this.active = true;
            this.initScript.call(window, this); 
            this.i = 1;
        }
        if (this.active) {
            this.sceneScript.call(window, this);
        }
    }

    pause() { this.active = false; }
    run() { this.active = true; }
    
    reset() { 
        this.endScript.call(window, this);
        this.i = 0;
    }

    kill() { 
        this.endScript.call(window, this);
        this.active = false;
    }
}
class Choppy {
    constructor() {
        this.layers = []; 
        this.lastTime = 0;
    }

    addLayer(scene, name, init, end) {
        const newLayer = new ChScene(name, scene, init, end);
        this.layers.push(newLayer);
        return newLayer; 
    }

    removeLayer(name) {
        const idx = this.layers.findIndex(l => l.name === name);
        if (idx !== -1) {
            this.layers[idx].kill();
            this.layers.splice(idx, 1);
        }
    }

    get(name) {
        return this.layers.find(l => l.name === name);
    }

    changeLayer(name, newScene, newInit, newEnd) {
        let layer = this.get(name);
        if (layer) {
            layer.kill(); 
            
            layer.sceneScript = newScene || function() {};
            layer.initScript = newInit || function() {};
            layer.endScript = newEnd || function() {};

            layer.i = 0
        }
    }


    play() {
        const loop = (timestamp) => {
            if (!this.lastTime) this.lastTime = timestamp;
            const dt = (timestamp - this.lastTime) / 1000;
            this.lastTime = timestamp;

            window.deltaTime = dt;

            for (let i = 0; i <= this.layers.length - 1; i++) {
                const layer = this.layers[i];
                if (!layer) continue;

               
                if (layer.clampPause && layer.i !== 0) {
                    if (dt > 0.1) {
                        layer.active = false;
                    } else {
                        layer.active = true;
                    }
                }
                
                layer.step();
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

// Shotty

class Shot {
    constructor(initFn, endFn) {
        this.init = initFn;
        this.end = endFn;
    }
    play() { 
        if (this.init) this.init(); 
    }
    stop() { 
        if (this.end) this.end(); 
    }
}

class Shotter {
    constructor(shots = []) {
        this.i = 0;
        this.bi = 0;
        this._isInit = true;
        this.shots = shots;
    }
    shot() {
        if (!this.shots[this.i]) return;
        if (this._isInit) {
            this.shots[this.i].play();
            this._isInit = false;
        } else {
            this.shots[this.bi].stop();
            this.shots[this.i].play();
        }
        this.bi = this.i;
    }
    shotNext(steps = 1) {
        if (this.shots.length === 0) return;
        this.i = (this.i + steps) % this.shots.length;
        this.shot();
    }
    shotBack(steps = 1) {
        if (this.shots.length === 0) return;
        this.i = (this.i - steps + this.shots.length) % this.shots.length;
        this.shot();
    }
}

// Stamp and pixyte

class Pixyte {
    constructor(canvas) {
        this.canvas = canvas
        this.ctx = this.canvas.getContext("2d");
        this.registry = [];
    }

    add(symbol) {
        this.registry.push(symbol);
        return symbol;
    }

    render() {
        // Limpiamos el escenario global nativo
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Z-Order: Los símbolos con Z mayor se estampan al final (arriba)
        this.registry.sort((a, b) => (a.z || 0) - (b.z || 0));

        for (let i = 0; i < this.registry.length; i++) {
            const s = this.registry[i];
            if (!s || !s.visible || !s.exists) continue;

            // Si el símbolo tiene cambios en sus comandos, se re-rasteriza solo
            if (s.isDirty) s.updateAsset();

            // TRANSFERENCIA DIRECTA: De la RAM del símbolo al CTX del navegador
            this.ctx.putImageData(s.imgData, s.x | 0, s.y | 0);
        }
    }
}

class StampSymbol {
    constructor(w, h, x = 0, y = 0, z = 0) {
        this.width = w | 0;
        this.height = h | 0;
        this.x = x; this.y = y; this.z = z;
        this.visible = true;
        this.exists = true;

        // Memoria persistente del asset (Buffer local)
        this.buffer = new Uint8ClampedArray(this.width * this.height * 4);
        this.imgData = new ImageData(this.buffer, this.width, this.height);
        this.buffer.fill(0); // Nace transparente

        // EL HISTORIAL ESCALABLE: Array de comandos (aristas, bitmaps, filtros)
        this.commands = [];
        this.isDirty = true;
        this.onclick = () => {};
    }

    // --- API DE COMANDOS ESCALABLES ---

    moveTo(x, y) {
        this.commands.push({ type: 'move', x, y });
        this.isDirty = true;
        return this;
    }

    lineTo(x, y, t = 2, r = 255, g = 255, b = 255, a = 255) {
        this.commands.push({ type: 'line', x, y, t, r, g, b, a });
        this.isDirty = true;
        return this;
    }

    // Filtro Alpha-Lock (Mask) integrado al comando Bitmap
    addBitmap(pixelData, bw, bh, offX = 0, offY = 0, filter = 'normal') {
        this.commands.push({
            type: 'bitmap',
            data: pixelData,
            w: bw | 0, h: bh | 0,
            x: offX | 0, y: offY | 0,
            filter: filter // 'normal' o 'alpha-lock'
        });
        this.isDirty = true;
        return this;
    }

    // --- RASTERIZADOR INTERNO (Bake de píxeles) ---

    updateAsset() {
        this.buffer.fill(0); // Limpiamos el minilienzo local para re-procesar los comandos
        let lx = 0, ly = 0;

        for (const cmd of this.commands) {
            if (cmd.type === 'move') {
                lx = cmd.x; ly = cmd.y;
            } else if (cmd.type === 'line') {
                this._rasterizeLocalLine(lx, ly, cmd.x, cmd.y, cmd.t, cmd.r, cmd.g, cmd.b, cmd.a);
                lx = cmd.x; ly = cmd.y;
            } else if (cmd.type === 'bitmap') {
                this._blit(cmd);
            }
        }
        this.isDirty = false;
    }

    _blit(cmd) {
        const src = cmd.data;
        const dest = this.buffer;
        const sw = cmd.w, dw = this.width;

        for (let iy = 0; iy < cmd.h; iy++) {
            const dy = (cmd.y + iy) | 0;
            if (dy < 0 || dy >= this.height) continue;
            const destRow = dy * dw;
            const srcRow = iy * sw;

            for (let ix = 0; ix < sw; ix++) {
                const dx = (cmd.x + ix) | 0;
                if (dx < 0 || dx >= dw) continue;

                const sIdx = (srcRow + ix) << 2;
                if (src[sIdx + 3] === 0) continue; 

                const dIdx = (destRow + dx) << 2;

                // Filtro de Máscara (Alpha Lock)
                if (cmd.filter === 'alpha-lock') {
                    if (dest[dIdx + 3] > 0) { // Solo si ya hay algo pintado
                        dest[dIdx] = src[sIdx]; dest[dIdx+1] = src[sIdx+1];
                        dest[dIdx+2] = src[sIdx+2]; dest[dIdx+3] = src[sIdx+3];
                    }
                } else {
                    dest[dIdx] = src[sIdx]; dest[dIdx+1] = src[sIdx+1];
                    dest[dIdx+2] = src[sIdx+2]; dest[dIdx+3] = src[sIdx+3];
                }
            }
        }
    }

    _rasterizeLocalLine(x1, y1, x2, y2, t, r, g, b, a) {
        let ix1 = x1 | 0, iy1 = y1 | 0, ix2 = x2 | 0, iy2 = y2 | 0;
        const offset = t >> 1, dx = Math.abs(ix2 - ix1), dy = Math.abs(iy2 - iy1);
        const sx = ix1 < ix2 ? 1 : -1, sy = iy1 < iy2 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            for (let iy = 0; iy < t; iy++) {
                const py = (iy1 + iy - offset) | 0;
                if (py >= 0 && py < this.height) {
                    const row = py * this.width;
                    for (let ix = 0; ix < t; ix++) {
                        const px = (ix1 + ix - offset) | 0;
                        if (px >= 0 && px < this.width) {
                            const i = (row + px) << 2;
                            this.buffer[i] = r; this.buffer[i+1] = g;
                            this.buffer[i+2] = b; this.buffer[i+3] = a;
                        }
                    }
                }
            }
            if (ix1 === ix2 && iy1 === iy2) break;
            const e2 = err << 1;
            if (e2 > -dy) { err -= dy; ix1 += sx; }
            if (e2 < dx) { err += dx; iy1 += sy; }
        }
    }
}


class StampStage {
    constructor(canvasId, w, h) {
        this.canvas = document.getElementById(canvasId);
        
        // Motores integrados
        this.renderer = new Pixyte(this.canvas);
        this.engine = new Choppy(); // <--- Choppy2D-js manda aquí
        this.shotter = new Shotter();

        this.init();
    }

    init() {
        this.engine.addLayer(() => {
            this.renderer.render();
        }, "RENDER_LAYER");

        this.canvas.addEventListener("mousedown", (e) => this.handleInput(e));
        
        this.engine.play();
    }

    addChild(symbol) {
        this.renderer.add(symbol);
        return symbol;
    }

    handleInput(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const list = this.renderer.registry;

        // Buscamos de adelante hacia atrás (Z-Order)
        for (let i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            if (!s.exists || !s.visible || !s.onclick || s.commands.length === 0) continue;

            // --- RECALCULO DINÁMICO ---
            // Inicializamos con el primer comando
            let first = s.commands[0];
            let minX = first.x, maxX = first.x;
            let minY = first.y, maxY = first.y;

            // Escaneamos los "Edges" para encontrar los límites reales en este frame
            for (let j = 1; j < s.commands.length; j++) {
                const cmd = s.commands[j];
                if (cmd.x < minX) minX = cmd.x;
                if (cmd.x > maxX) maxX = cmd.x;
                if (cmd.y < minY) minY = cmd.y;
                if (cmd.y > maxY) maxY = cmd.y;
            }

            // Aplicamos la escala y la posición global del símbolo
            const sc = s.scale || 1;
            const realXMin = s.x + (minX * sc);
            const realXMax = s.x + (maxX * sc);
            const realYMin = s.y + (minY * sc);
            const realYMax = s.y + (maxY * sc);

            // HIT-TEST de precisión
            if (mx >= realXMin && mx <= realXMax && my >= realYMin && my <= realYMax) {
                s.onclick();
                break; // Solo clickeamos el objeto que está más arriba
            }
        }
    }

}
