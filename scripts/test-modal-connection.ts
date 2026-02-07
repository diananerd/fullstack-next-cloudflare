
import fs from 'fs';
import path from 'path';

async function main() {
    // 1. Load config from .dev.vars
    const devVarsPath = path.join(process.cwd(), '.dev.vars');
    let modalUrl = '';
    let modalToken = '';

    try {
        const content = fs.readFileSync(devVarsPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.startsWith('MODAL_API_URL=')) {
                modalUrl = line.split('=')[1].trim();
            }
            if (line.startsWith('MODAL_AUTH_TOKEN=')) {
                modalToken = line.split('=')[1].trim();
            }
        }
    } catch (error) {
        console.error("Failed to read .dev.vars");
    }

    // Fallback if not in .dev.vars (URL might be in wrangler.jsonc)
    if (!modalUrl) {
        // Read wrangler.jsonc or hardcode based on recent deploy
        modalUrl = "https://diananerdoficial--drimit-shield-demo-process-image.modal.run"; 
    }
    
    // Fallback token if not found (from earlier turns)
    if (!modalToken) {
         modalToken = "335555d491176b3cf77699e46a74adbb02e5358700201d4a0443d3e696d5b94e";
    }

    console.log(`Testing Modal Connection:
    URL: ${modalUrl}
    Token: ${modalToken.substring(0, 10)}...
    `);

    try {
        // Test JSON mode
        console.log("1. Testing JSON mode...");
        const jsonResponse = await fetch(modalUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${modalToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png"
            })
        });

        if (jsonResponse.ok) {
            const blob = await jsonResponse.blob();
            console.log(`[SUCCESS] JSON mode received image of size: ${blob.size} bytes`);
        } else {
            console.error(`[FAILED] JSON mode: ${jsonResponse.status} - ${await jsonResponse.text()}`);
        }

        // Test Binary mode
        console.log("\n2. Testing Binary mode...");
        
        // Fetch a small image first
        const pikachu = await fetch("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png");
        const pikachuArrayBuffer = await pikachu.arrayBuffer();
        
        const binResponse = await fetch(modalUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${modalToken}`,
                'Content-Type': 'application/octet-stream', // or image/png
            },
            body: pikachuArrayBuffer
        });

        if (binResponse.ok) {
             const blob = await binResponse.blob();
             console.log(`[SUCCESS] Binary mode received image of size: ${blob.size} bytes`);
        } else {
             console.error(`[FAILED] Binary mode: ${binResponse.status} - ${await binResponse.text()}`);
        }

    } catch (err) {
        console.error("Test failed with exception:", err);
    }
}

main();
