import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

const router = express.Router();

// Function to remove session directory
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

// Function to convert session folder to Base64 with prefix
async function getSessionBase64(sessionPath) {
    try {
        const credsFile = sessionPath + '/creds.json';
        if (!fs.existsSync(credsFile)) return null;
        
        const credsContent = fs.readFileSync(credsFile);
        const base64Session = credsContent.toString('base64');
        const prefixedBase64 = `TYREX_KSH-MD~${base64Session}`;
        return prefixedBase64;
    } catch (error) {
        console.error('Error converting session to base64:', error);
        return null;
    }
}

// Simple phone number validation - just check if it's numbers only
function validatePhoneNumber(num) {
    // Remove any non-digit characters
    const clean = num.replace(/[^0-9]/g, '');
    
    // Check if it's a valid length (between 9 and 15 digits)
    if (clean.length >= 9 && clean.length <= 15) {
        return clean;
    }
    return null;
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    
    console.log(`📱 Received number: ${num}`);
    
    if (!num) {
        return res.status(400).send({ 
            success: false, 
            message: 'Phone number is required' 
        });
    }
    
    // Clean and validate phone number
    let cleanNumber = validatePhoneNumber(num);
    
    if (!cleanNumber) {
        console.log(`❌ Invalid number: ${num}`);
        return res.status(400).send({ 
            success: false, 
            message: 'Invalid phone number. Please enter your full international number (e.g., 255712345678 for Tanzania) without + or spaces.' 
        });
    }
    
    console.log(`✅ Valid number: ${cleanNumber}`);
    
    // Create unique session directory
    let dirs = './session_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    
    // Ensure session directory exists
    if (!fs.existsSync(dirs)) {
        fs.mkdirSync(dirs, { recursive: true });
    }

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();
            
            let TYREX_KSH = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }).child({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 3,
            });

            let sessionSent = false;
            let codeSent = false;

            // Handle connection update
            TYREX_KSH.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    
                    if (!sessionSent) {
                        sessionSent = true;
                        console.log("📱 Generating Base64 session...");
                        
                        try {
                            // Wait a bit for session to be fully saved
                            await delay(3000);
                            
                            const prefixedBase64 = await getSessionBase64(dirs);
                            
                            if (prefixedBase64) {
                                const userJid = jidNormalizedUser(cleanNumber + '@s.whatsapp.net');
                                
                                // Send session to user
                                await TYREX_KSH.sendMessage(userJid, {
                                    text: `🎉 TYREX_KSH MD Session Generated Successfully! 🎉\n\n📱 Your Session:\n${prefixedBase64}`
                                });
                                console.log("📄 Base64 session sent successfully");
                                
                                // Clean up
                                await delay(2000);
                                removeFile(dirs);
                                console.log("✅ Session cleaned up");
                                
                                // Send response if not already sent
                                if (!res.headersSent && !codeSent) {
                                    res.send({ 
                                        success: true, 
                                        message: 'Session generated and sent to your WhatsApp!'
                                    });
                                }
                            } else {
                                throw new Error('Failed to generate Base64 session');
                            }
                        } catch (error) {
                            console.error("❌ Error sending session:", error);
                            if (!res.headersSent && !codeSent) {
                                res.status(500).send({ 
                                    success: false, 
                                    message: 'Error generating session: ' + error.message 
                                });
                            }
                        }
                        
                        // Close connection after sending
                        setTimeout(() => {
                            TYREX_KSH.end(new Error('Session complete'));
                        }, 5000);
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`🔌 Connection closed. Status code: ${statusCode}`);
                    
                    if (statusCode === 401) {
                        console.log("❌ Logged out");
                        removeFile(dirs);
                    }
                }
            });

            // Request pairing code
            if (!TYREX_KSH.authState.creds.registered) {
                console.log(`🔑 Requesting pairing code for ${cleanNumber}...`);
                
                try {
                    // Wait for socket to be ready
                    await delay(3000);
                    
                    const code = await TYREX_KSH.requestPairingCode(cleanNumber);
                    console.log(`✅ Pairing code received: ${code}`);
                    
                    // Format code with dashes every 4 digits
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    codeSent = true;
                    if (!res.headersSent) {
                        res.send({ 
                            success: true, 
                            code: formattedCode,
                            message: 'Pairing code generated successfully!'
                        });
                    }
                } catch (error) {
                    console.error('❌ Error requesting pairing code:', error);
                    
                    // Clean up
                    removeFile(dirs);
                    TYREX_KSH.end(new Error('Pairing failed'));
                    
                    if (!res.headersSent) {
                        let errorMessage = 'Failed to get pairing code. ';
                        
                        if (error.message?.toLowerCase().includes('timeout')) {
                            errorMessage += 'Request timed out. Please try again.';
                        } else if (error.message?.includes('400') || error.message?.includes('invalid')) {
                            errorMessage += 'Invalid phone number format. Make sure to include country code. Example: 255712345678';
                        } else if (error.message?.includes('405') || error.message?.includes('rate')) {
                            errorMessage += 'Too many attempts. Please wait a few minutes and try again.';
                        } else {
                            errorMessage += 'Please check your phone number and try again.';
                        }
                        
                        res.status(503).send({ 
                            success: false, 
                            message: errorMessage
                        });
                    }
                }
            }

            TYREX_KSH.ev.on('creds.update', saveCreds);
            
        } catch (err) {
            console.error('Error initializing session:', err);
            removeFile(dirs);
            if (!res.headersSent) {
                res.status(503).send({ 
                    success: false, 
                    message: 'Service Unavailable. Please try again.' 
                });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export default router;
