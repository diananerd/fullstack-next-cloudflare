
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
        // Updated URL after deployment
        modalUrl = "https://diananerdoficial--drimit-shield-demo-submit-protection-job.modal.run"; 
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
        // Test Submit Job
        console.log("1. Testing Submit Job...");
        const payload = {
            image_url: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
            artwork_id: "test-artwork-123",
            user_id: "test-user-456",
            method: "mist"
        };

        const jsonResponse = await fetch(modalUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${modalToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (jsonResponse.ok) {
            const data = await jsonResponse.json();
            console.log(`[SUCCESS] Job submitted! response:`, data);
        } else {
            console.error(`[FAILED] Submit job: ${jsonResponse.status} - ${await jsonResponse.text()}`);
        }

    } catch (err) {
        console.error("Test failed with exception:", err);
    }
}

main();
