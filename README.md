# Stamp
The framework that largely replaces the Openfl/Flash API

An tools bundle for Make games (and animations :D)

Every symbol is an Mini-Canvas
and Pixyte controls it's render in the Main Canvas,
it has their comands for scalable render

Better if you use Gsap, An Audio engine like WebAudio API, Choppy or Shotty >:D

Here is an Demo:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stamp Framework Demo</title>
    <style>
        body { background: #1a1a1a; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        canvas { background: #000; border: 2px solid #333; }
    </style>
</head>
<body>

    <canvas id="myCanvas" width="800" height="600"></canvas>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js" integrity="sha512-NcZdtrT77bJr4STcmsGAESr06BYGE8woZdSdEgqnpyqac7sugNO+Tr4bGwGF3MsnEkGKhU2KL2xh6Ec+BqsaHA==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    
    <script src="./stamp.js"></script>

    <script>
            const app = new StampStage("myCanvas", 800, 600);

            const columpio = new StampSymbol(200, 400, 0, -300);
            columpio.z = 1;

            columpio.moveTo(100, 0);   
            columpio.lineTo(100, 300, 3, 200, 200, 200);
            columpio.lineTo(150, 300, 15, 139, 69, 19);

            const cuerdaCmd = columpio.commands[1]; 
            const asientoCmd = columpio.commands[2]; 
            
            app.addChild(columpio);

            const tl = gsap.timeline({ repeat: -1, yoyo: true });

            tl.to(columpio, {
                x: "+=80",
                duration: 1.5,
                ease: "sine.inOut"
            });

            tl.to([cuerdaCmd, asientoCmd], {
                x: "+=20",
                duration: 1.5,
                ease: "sine.inOut",
                onUpdate: () => columpio.isDirty = true 
            }, 0);

    </script>
</body>
</html>
```