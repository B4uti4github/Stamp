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

// Stamp and Pixyte

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

    _checkAndResize() {
        let maxX = 0, maxY = 0;
        const padding = 20; // Margen de seguridad para que no crezca en cada micro-pixel

        // Escaneamos los comandos para ver el punto más lejano
        for (const cmd of this.commands) {
            if(!cmd) continue;
            if (Math.abs(cmd.x) > maxX) maxX = Math.abs(cmd.x);
            if (Math.abs(cmd.y) > maxY) maxY = Math.abs(cmd.y);
        }

        // El tamaño necesario (doble del radio para rotaciones)
        const neededW = (maxX * 2) + padding;
        const shadowH = (maxY * 2) + padding;

        // SOLO creamos memoria nueva si el dibujo actual supera el buffer existente
        if (neededW > this.width || shadowH > this.height) {
            this.width = neededW | 0;
            this.height = shadowH | 0;
            this.buffer = new Uint8ClampedArray(this.width * this.height * 4);
            this.imgData = new ImageData(this.buffer, this.width, this.height);
            // Al ser un buffer nuevo, forzamos el redibujo total
            this.isDirty = true; 
        }
    }


    // --- RASTERIZADOR INTERNO (Bake de píxeles) ---

    updateAsset() {
        // 1. Verificamos si el dibujo se sale y agrandamos la "hoja"
        this._checkAndResize();
        
        // 2. Limpiamos el minilienzo (Transparencia total)
        this.buffer.fill(0); 
        
        let lx = 0, ly = 0;
        const cx = this.width >> 1;
        const cy = this.height >> 1;

        // Pre-calculamos el ángulo para todos los comandos del frame
        const angle = (this.rotation || 0) * (Math.PI / 180);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        for (const cmd of this.commands) {
            if (!cmd) continue;

            if (cmd.type === 'move' || cmd.type === 'line') {
                // --- ROTACIÓN DE VECTORES (EDGES) ---
                // Rotamos el punto relativo al centro del buffer
                const tx = (cmd.x * cos - cmd.y * sin + cx) | 0;
                const ty = (cmd.x * sin + cmd.y * cos + cy) | 0;

                if (cmd.type === 'move') {
                    lx = tx; ly = ty;
                } else {
                    this._rasterizeLocalLine(lx, ly, tx, ty, cmd.t, cmd.r, cmd.g, cmd.b, cmd.a);
                    lx = tx; ly = ty;
                }
            } 
            else if (cmd.type === 'bitmap') {
                // --- ROTACIÓN DE BITMAPS (BLIT PRO) ---
                this._blit(cmd, cos, sin, cx, cy);
            }
        }
        this.isDirty = false;
    }

    // Blit con Rotación por Software (Inverse Mapping)
    _blit(cmd, cos, sin, cx, cy) {
        const src = cmd.data;
        const dest = this.buffer;
        const sw = cmd.w, sh = cmd.h;
        const dw = this.width, dh = this.height;

        // Centros locales del bitmap para rotar sobre su propio eje
        const lCx = sw >> 1, lCy = sh >> 1;

        // Calculamos el área de escaneo (Bounding Box de la rotación)
        const size = (Math.sqrt(sw * sw + sh * sh)) | 0;
        const hSize = size >> 1;

        for (let iy = 0; iy < size; iy++) {
            // Posición Y en el lienzo del símbolo (centrado en cmd.y)
            const py = (cmd.y + iy - hSize + cy) | 0;
            if (py < 0 || py >= dh) continue;
            const dRow = py * dw;

            for (let ix = 0; ix < size; ix++) {
                const px = (cmd.x + ix - hSize + cx) | 0;
                if (px < 0 || px >= dw) continue;

                // Mapeo Inverso: ¿Qué píxel del asset original corresponde a este punto rotado?
                const dx = ix - hSize;
                const dy = iy - hSize;
                
                // Aplicamos la rotación inversa (cos/-sin)
                const sx = (dx * cos + dy * sin + lCx) | 0;
                const sy = (dy * cos - dx * sin + lCy) | 0;

                if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
                    const sIdx = (sy * sw + sx) << 2;
                    if (src[sIdx + 3] > 0) { // Si no es transparente
                        const dIdx = (dRow + px) << 2;
                        
                        // Filtro Alpha-Lock (Opcional)
                        if (cmd.filter === 'alpha-lock' && dest[dIdx + 3] === 0) continue;

                        dest[dIdx] = src[sIdx];
                        dest[dIdx+1] = src[sIdx+1];
                        dest[dIdx+2] = src[sIdx+2];
                        dest[dIdx+3] = src[sIdx+3];
                    }
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
        
        this.engine.play();
    }

    addChild(symbol) {
        this.renderer.add(symbol);
        return symbol;
    }
}
