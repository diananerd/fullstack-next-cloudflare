
import fs from 'fs';
import path from 'path';

async function main() {
    // 1. Load config from .dev.vars
    const devVarsPath = path.join(process.cwd(), '.dev.vars');
    let modalUrl = '';

    try {
        const content = fs.readFileSync(devVarsPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.startsWith('MODAL_STATUS_URL=')) {
                modalUrl = line.split('=')[1].trim();
            }
        }
    } catch (error) {
        console.error("Failed to read .dev.vars");
    }

    // Hardcoded fallback based on what we know in wrangler.jsonc
    if (!modalUrl) {
        modalUrl = "https://diananerdoficial--drimit-shield-demo-check-status.modal.run";
    }

    // Remove quotes if present
    modalUrl = modalUrl.replace(/"/g, "");

    console.log(`Testing Modal Bulk Status:
    URL: ${modalUrl}
    `);

    try {
        const payload = {
            artwork_ids: ["test-id-1", "test-id-2"] // Dummy IDs
        };

        console.log("Sending payload:", JSON.stringify(payload, null, 2));

        const response = await fetch(modalUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);
        
        const text = await response.text();
        console.log("Response Body:", text);

    } catch (error) {
        console.error("Test Failed:", error);
    }
}

main();
