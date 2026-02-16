// Choppy

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

// To-do: Pixyte and Stamp tools