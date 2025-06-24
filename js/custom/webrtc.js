// js/custom/webrtc.js

let peer;
let hostConnection; // For peers, the connection to the host
const peerConnections = []; // For the host, all connections to peers
let sessionData; // For peers, to store the session state
let uiUpdateCallback; // For peers, to update the UI
let inactivityTimer = null; // Timer to close inactive sessions
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 5 minutes

/**
 * (Index Page) Validates if a join code corresponds to an active host.
 * @param {string} joinCode The 6-digit code to validate.
 * @param {function} onSuccess Callback function on successful validation.
 * @param {function} onError Callback function on failed validation.
 */
function validateJoinCode(joinCode, onSuccess, onError) {
    const tempPeer = new Peer();
    let connection = null;

    const validationTimeout = setTimeout(() => {
        console.error("Validation timed out for code:", joinCode);
        cleanup();
        if (onError) onError({ type: 'timeout', message: 'Could not verify the session code in time. The host may be on a slow network. Please try again.' });
    }, 7000); // 7-second timeout, as peer creation can sometimes be slow.

    const cleanup = () => {
        clearTimeout(validationTimeout);
        if (connection) {
            // We close the connection immediately after validation.
            // The actual connection will be re-established on the join.html page.
            connection.close();
        }
        if (tempPeer && !tempPeer.destroyed) {
            tempPeer.destroy();
        }
        console.log("Validation cleanup complete.");
    };

    tempPeer.on('open', id => {
        console.log('Temporary peer created for validation: ' + id);
        connection = tempPeer.connect(joinCode, { reliable: false });

        connection.on('open', () => {
            console.log('Validation successful: Host exists.');
            cleanup();
            if (onSuccess) onSuccess();
        });

        connection.on('error', err => {
            console.error('Validation connection error:', err);
            cleanup();
            if (onError) onError({ type: 'connection-error', message: 'An error occurred while trying to connect to the host.' });
        });
    });

    tempPeer.on('error', err => {
        console.error('Validation peer error:', err);
        cleanup();
        if (err.type === 'peer-unavailable') {
            if (onError) onError({ type: 'peer-unavailable', message: `Couldn't find that gwamble, sorry. Try a different code?` });
        } else {
            if (onError) onError({ type: 'generic-error', message: 'An unknown error occurred during validation.' });
        }
    });
}

/**
 * (Host only) Resets the inactivity timer. If no peers are connected,
 * the session will be closed after a timeout.
 */
function resetInactivityTimer() {
    // This function should only run on the host's machine.
    if (sessionStorage.getItem('isHost') !== 'true') {
        return;
    }

    // Clear any existing timer
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    // If there are any peers, the session is active. Do nothing.
    if (peerConnections.length > 0) {
        console.log(`Session is active with ${peerConnections.length} peer(s). Inactivity timer stopped.`);
        return;
    }

    // If there are no peers, start a new timer to close the session.
    console.log(`Session is empty. It will close in ${INACTIVITY_TIMEOUT_MS / 1000 / 60} minutes if no one joins.`);
    inactivityTimer = setTimeout(() => {
        // Check one last time before closing.
        if (peerConnections.length === 0) {
            console.log("Session timed out due to inactivity.");
            showModalMessage("Session closed due to inactivity.");
            
            // The closeSession function in session.html handles cleanup and redirect.
            if (typeof closeSession === 'function') {
                closeSession();
            } else {
                // Fallback cleanup if the global function isn't found
                if (peer) peer.destroy();
                sessionStorage.clear();
                window.location.replace('index.html');
            }
        }
    }, INACTIVITY_TIMEOUT_MS);
}

/**
 * Initializes the host's PeerJS object, waits for it to register with the
 * signaling server, and then redirects to the session page.
 * @param {string} joinCode The 6-digit code for the session.
 * @param {function} [onError] Optional callback for when an error occurs.
 */
function initializeHostAndRedirect(joinCode, onError) {
    if (peer) {
        peer.destroy();
    }

    peer = new Peer(joinCode);

    peer.on('open', (id) => {
        console.log('Host PeerJS ID is: ' + id + '. Redirecting to session page.');
        // Add a flag to identify the user as the host
        sessionStorage.setItem('isHost', 'true');
        // Now that the host is registered on the signaling server, we can redirect.
        window.location.href = 'session.html';
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        showModalMessage('An error occurred while trying to host the session. The join code might already be in use. Please try again.');
        sessionStorage.clear();
        if (onError) {
            onError();
        }
    });
}

/**
 * (Host Only) Re-establishes the host's peer object and listeners on the session page.
 */
function reestablishHostConnection() {
    const joinCode = sessionStorage.getItem('gwamble_join_code');
    if (!joinCode) {
        console.error("No join code found for host.");
        window.location.href = 'index.html';
        return;
    }

    // Host needs a persistent ID to track its own potential actions (if any)
    // and to be consistent in the user list.
    let persistentId = localStorage.getItem('gwamble_persistent_user_id');
    if (!persistentId) {
        persistentId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        localStorage.setItem('gwamble_persistent_user_id', persistentId);
    }

    if (peer) {
        peer.destroy();
    }

    peer = new Peer(joinCode);

    peer.on('open', (id) => {
        console.log('Host connection re-established with ID: ' + id);
        // Dispatch event for host to add themself to UI
        handleMessage({ type: 'host-ready', payload: { peerId: id, username: getLocalUsername() } });
        // Start monitoring for inactivity as soon as the host is ready.
        resetInactivityTimer();
    });
    
    peer.on('error', (err) => {
        console.error('PeerJS error on host:', err);
    });

    peer.on('connection', (conn) => {
        console.log(`New connection from ${conn.peer}`);
        conn.on('open', () => {
            console.log('Connection opened. Sending session data.');
            const session = JSON.parse(sessionStorage.getItem('gwamble'));
            conn.send({ type: 'session-data', payload: session });
            // --- FIX: Always use persistentId for members ---
            // Find or add member by persistentId
            if (conn.persistentId) {
                let sessionObj = JSON.parse(sessionStorage.getItem('gwamble'));
                if (sessionObj) {
                    let exists = sessionObj.members.find(m => m.user_id === conn.persistentId);
                    if (!exists) {
                        sessionObj.members.push({ user_id: conn.persistentId, username: conn.username, is_host: false });
                        sessionStorage.setItem('gwamble', JSON.stringify(sessionObj));
                    }
                }
            }
            peerConnections.push(conn);
            resetInactivityTimer();
        });
        conn.on('data', (data) => {
            if (data.type === 'user-reconnected') {
                conn.username = data.payload.username;
                conn.persistentId = data.payload.persistentId;
                // --- FIX: Store peer's credits on connection and in session ---
                conn.credits = data.payload.credits;

                let sessionObj = JSON.parse(sessionStorage.getItem('gwamble'));
                if (sessionObj) {
                    let member = sessionObj.members.find(m => m.user_id === conn.persistentId);
                    if (!member) {
                        sessionObj.members.push({
                            user_id: conn.persistentId,
                            username: conn.username,
                            is_host: false,
                            credits: conn.credits // Store credits in session
                        });
                    } else {
                        // If user is reconnecting, update their credits in the session state
                        member.credits = conn.credits;
                    }
                    sessionStorage.setItem('gwamble', JSON.stringify(sessionObj));
                }
                const joinPayload = {
                    peerId: conn.persistentId, // Use persistentId
                    username: data.payload.username,
                    persistentId: data.payload.persistentId,
                    credits: data.payload.credits // Pass credits in broadcast
                };
                const newUserMessage = { type: 'user-joined', payload: joinPayload };
                broadcastMessage(newUserMessage, conn.peer);
                handleMessage(newUserMessage);
                // Send the full list of users (including the new one) back to the new peer
                const allUsers = peerConnections
                    .map(p => ({
                        peerId: p.persistentId || p.peer,
                        username: p.username,
                        persistentId: p.persistentId || p.peer
                    }))
                    .filter(p => p.username);
                allUsers.push({
                    peerId: localStorage.getItem('gwamble_persistent_user_id'),
                    username: getLocalUsername(),
                    persistentId: localStorage.getItem('gwamble_persistent_user_id')
                });
                conn.send({ type: 'user-list', payload: { users: allUsers } });
            } else if (data.type === 'bet-placed') {
                handleBetPlaced(data.payload.betInfo);
            } else {
                broadcastMessage(data, conn.peer);
                handleMessage(data);
            }
        });

        conn.on('close', () => {
            console.log(`Connection from ${conn.peer} closed.`);
            const index = peerConnections.findIndex(p => p.peer === conn.peer);
            if (index > -1) {
                const leavingPeer = peerConnections[index];
                peerConnections.splice(index, 1);
                // Only broadcast if the user had fully joined (i.e., had a username)
                if (leavingPeer.username) {
                    const userLeftMessage = {
                        type: 'user-left',
                        payload: {
                            peerId: leavingPeer.peer,
                            username: leavingPeer.username,
                            persistentId: leavingPeer.persistentId // Include for completeness
                        }
                    };
                    handleMessage(userLeftMessage);
                    broadcastMessage(userLeftMessage);
                }
            }
            // A peer has left. Reset the timer. If it was the last peer, the timeout will start.
            resetInactivityTimer();
        });
    });
}

function handleBetPlaced(betInfo) {
    let session = JSON.parse(sessionStorage.getItem('gwamble'));
    if (!session) return;

    // Use the persistent user ID from betInfo to check for existing bets.
    const alreadyBet = session.bets.some(b => b.user_id === betInfo.userId);

    if (alreadyBet) {
        console.warn(`User ${betInfo.userId} has already bet. Ignoring subsequent bet.`);
        return; // IMPORTANT: Prevents multiple bets from the same user.
    }

    // If host is placing a bet, deduct credits immediately
    const hostId = localStorage.getItem('gwamble_persistent_user_id');
    if (betInfo.userId === hostId) {
        let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
        const currentCredits = user.credits || 100;
        user.credits = Math.max(currentCredits - 10, 10);
        localStorage.setItem('gwambleUser', JSON.stringify(user));
        console.log(`HOST BET PLACED: Deducted 10 credits. ${currentCredits} -> ${user.credits}`);
    }

    // If no bet exists for this user, add the new bet.
    session.bets.push({
        user_id: betInfo.userId, // This is the persistentId
        selected_outcome: betInfo.outcome,
        bet_amount: betInfo.amount
    });

    sessionStorage.setItem('gwamble', JSON.stringify(session));

    // Broadcast the entire updated bets array to all clients for consistency
    broadcastMessage({ type: 'bets-updated', payload: { bets: session.bets } });
    // Also update the host's own UI directly
    handleMessage({ type: 'bets-updated', payload: { bets: session.bets } });
}

// --- CREDIT DISTRIBUTION LOGIC ---
/**
 * Distribute credits at the end of a session.
 * @param {string} winningOutcome - The outcome that won (e.g. 'a' or 'b')
 * @param {Array} bets - Array of bet objects {user_id, username, selected_outcome, bet_amount}
 * @param {Object} userCredits - Map of user_id to current credits
 * @returns {Object} updatedCredits - Map of user_id to new credits
 */
function distributeCredits(winningOutcome, bets, userCredits) {
    const MIN_CREDITS = 10;
    const BET_AMOUNT = 10;
    const MAX_SESSION_GAIN = 100;
    
    // Track the changes for each user
    let creditChanges = {};
    
    // Initialize changes to 0 for all bettors
    bets.forEach(bet => {
        creditChanges[bet.user_id] = 0;
    });

    // --- Ensure host is always included for compensation ---
    const hostId = localStorage.getItem('gwamble_persistent_user_id');
    if (hostId) {
        if (userCredits[hostId] === undefined) {
            // Try to get host's credits from localStorage, fallback to 100
            let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
            userCredits[hostId] = user.credits !== undefined ? user.credits : 100;
        }
        if (creditChanges[hostId] === undefined) creditChanges[hostId] = 0;
    }
    
    // Separate winners and losers
    const winners = bets.filter(b => b.selected_outcome.toLowerCase() === winningOutcome.toLowerCase());
    const losers = bets.filter(b => b.selected_outcome.toLowerCase() !== winningOutcome.toLowerCase());
    
    console.log('Winners:', winners.length, 'Losers:', losers.length);
    
    // Calculate total pool from losers (they already lost 10 when betting)
    let totalPool = losers.length * BET_AMOUNT;
    
    // Mark losers as having lost 10 (they already lost this when betting)
    losers.forEach(loser => {
        creditChanges[loser.user_id] = -BET_AMOUNT;
        console.log(`Loser ${loser.user_id}: lost ${BET_AMOUNT} (already deducted when betting)`);
    });
    
    // WINNERS GET THEIR BET BACK + SHARE OF POOL
    if (winners.length > 0) {
        if (totalPool > 0) {
            // There are losers - winners get refund + share of losing pool
            const sharePerWinner = Math.floor(totalPool / winners.length);
            winners.forEach(winner => {
                const currentCredits = userCredits[winner.user_id] || 90; // They already lost 10 when betting
                let gain = BET_AMOUNT + sharePerWinner; // Get bet back + share
                gain = Math.min(gain, MAX_SESSION_GAIN); // Cap gain per session
                userCredits[winner.user_id] = currentCredits + gain;
                creditChanges[winner.user_id] = gain;
                console.log(`Winner ${winner.user_id}: ${currentCredits} -> ${currentCredits + gain} (gained ${gain})`);
            });
        } else {
            // No losers (solo winner or all winners) - just refund their bet
            winners.forEach(winner => {
                const currentCredits = userCredits[winner.user_id] || 90; // They already lost 10 when betting
                const refund = BET_AMOUNT; // Just get their bet back
                userCredits[winner.user_id] = currentCredits + refund;
                creditChanges[winner.user_id] = refund;
                console.log(`Solo Winner ${winner.user_id}: ${currentCredits} -> ${currentCredits + refund} (refunded ${refund})`);
            });
        }
    }

    // --- HOST COMPENSATION: +5 credits for hosting ---
    if (hostId && userCredits[hostId] !== undefined) {
        userCredits[hostId] += 5;
        creditChanges[hostId] += 5;
        console.log(`Host ${hostId} compensated +5 credits for hosting.`);
    }

    // --- Ensure host is present in session.members for credit update ---
    if (typeof sessionStorage !== 'undefined') {
        let session = JSON.parse(sessionStorage.getItem('gwamble'));
        if (session && session.members) {
            let hostMember = session.members.find(m => m.user_id === hostId);
            if (!hostMember) {
                // Add host to members if not present
                let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
                session.members.push({
                    user_id: hostId,
                    username: user.username || 'Host',
                    is_host: true,
                    credits: userCredits[hostId]
                });
            } else {
                hostMember.credits = userCredits[hostId];
            }
            sessionStorage.setItem('gwamble', JSON.stringify(session));
        }
    }
    // --- Always update host's localStorage credits ---
    if (hostId && userCredits[hostId] !== undefined) {
        let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
        user.credits = userCredits[hostId];
        localStorage.setItem('gwambleUser', JSON.stringify(user));
        console.log('Host localStorage credits updated:', user.credits);
    }
    // Store the changes in userCredits object for easy access
    userCredits._changes = creditChanges;
    return userCredits;
}

/**
 * (Host Only) Centralized function for handling winner declaration.
 * This should be called from the host's UI (session.html) when a winner is declared.
 * It calculates credit distribution and broadcasts the results.
 * @param {string} winningOutcome - The outcome that won ('a' or 'b').
 */
function handleHostWinnerDeclared(winningOutcome) {
    if (sessionStorage.getItem('isHost') !== 'true') {
        console.error("CRITICAL: handleHostWinnerDeclared called on a non-host client.");
        return;
    }

    let session = JSON.parse(sessionStorage.getItem('gwamble'));
    if (!session) {
        console.error("CRITICAL: Could not find session data for credit distribution.");
        return;
    }

    // FIX: Set the winner on the session object so the UI can find it.
    session.winner = winningOutcome;

    // First, broadcast the winner to all peers so their UI can update.
    broadcastMessage({ type: 'winner-declared', payload: { winner: winningOutcome } });

    // --- Build userCredits for ALL members, always include host ---
    let userCredits = {};
    const hostId = localStorage.getItem('gwamble_persistent_user_id');

    // Ensure host is in the members list for credit calculation
    if (hostId && session.members && !session.members.find(m => m.user_id === hostId)) {
        let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
        session.members.push({
            user_id: hostId,
            username: user.username || 'Host',
            is_host: true,
            credits: user.credits !== undefined ? user.credits : 100
        });
        console.log("Host was not in session members, added for credit calculation.");
    }
    
    // Populate userCredits from session members
    if (session.members && session.members.length > 0) {
        session.members.forEach(m => {
            // For host, always use the most up-to-date credits from localStorage
            if (m.is_host) {
                let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
                userCredits[m.user_id] = user.credits !== undefined ? user.credits : 100;
            } else {
                // For peers, use their credits stored in the session.
                userCredits[m.user_id] = m.credits !== undefined ? m.credits : 100;
            }
        });
    }

    // If for some reason userCredits is empty (e.g., no members), ensure host is still in.
    if (hostId && userCredits[hostId] === undefined) {
        let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
        userCredits[hostId] = user.credits !== undefined ? user.credits : 100;
        console.log("Host credits added to calculation as a fallback.");
    }

    console.log('Initial credits before distribution:', JSON.parse(JSON.stringify(userCredits)));
    
    // --- Distribute credits ---
    const result = distributeCredits(winningOutcome, session.bets || [], userCredits);
    const creditChanges = result._changes;
    delete result._changes; // Clean up the object

    console.log('Final credits after distribution:', result);
    console.log('Credit changes:', creditChanges);

    // Update credits AND creditChanges in the host's session.members object
    session.members.forEach(m => {
        if (result[m.user_id] !== undefined) {
            m.credits = result[m.user_id];
        }
        // Add the creditChange to the member object for the UI leaderboard.
        if (creditChanges && creditChanges[m.user_id] !== undefined) {
            m.creditChange = creditChanges[m.user_id];
        }
    });
    sessionStorage.setItem('gwamble', JSON.stringify(session));

    // Broadcast the final credit state to all peers
    const finalPayload = { 
        type: 'credits-updated', 
        payload: { 
            userCredits: result, 
            creditChanges 
        } 
    };
    broadcastMessage(finalPayload);

    // And handle it for the host's own UI
    handleMessage(finalPayload);
}

/**
 * (Peer Only) Sends a bet to the host.
 * @param {string} outcome The selected outcome ('a' or 'b').
 */
function sendBet(outcome) {
    console.log('sendBet called with outcome:', outcome);
    
    if (!hostConnection) {
        console.error("Cannot send bet, not connected to host.");
        return;
    }

    const persistentId = localStorage.getItem('gwamble_persistent_user_id');
    if (!persistentId) {
        console.error("Cannot send bet, no persistent user ID found.");
        return;
    }

    console.log('sendBet: About to send bet to host');

    const betInfo = {
        userId: persistentId,
        outcome: outcome,
        amount: 10
    };

    hostConnection.send({ type: 'bet-placed', payload: { betInfo: betInfo } });
    console.log('sendBet: Bet sent to host');
}

/**
 * (Peer Only) Disconnects from the host and cleans up the peer object.
 */
function disconnectFromHost() {
    if (hostConnection) {
        hostConnection.close();
    }
    if (peer) {
        peer.destroy();
    }
    console.log("Disconnected from host.");
}

/**
 * (Peer Only) Connects a peer to a host.
 * This is called from join.html
 * @param {string} hostId The 6-digit code of the host to connect to.
 * @param {function} updateCallback The function to call to update the UI.
 */
function joinSession(hostId, updateCallback) {
    // Explicitly clear the isHost flag to ensure this client is treated as a peer.
    sessionStorage.removeItem('isHost');
    uiUpdateCallback = updateCallback;

    // Get or create a persistent user ID to prevent duplicate betting on reload.
    let persistentId = localStorage.getItem('gwamble_persistent_user_id');
    if (!persistentId) {
        persistentId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        localStorage.setItem('gwamble_persistent_user_id', persistentId);
    }

    if (peer) {
        peer.destroy();
    }
    
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('My PeerJS ID is ' + id + ', connecting to host ' + hostId);
        hostConnection = peer.connect(hostId, { reliable: true });

        hostConnection.on('open', () => {
            console.log('Connection to host established. Announcing myself.');
            const username = getLocalUsername();
            // --- FIX: Send credits on connect ---
            const user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
            const credits = user.credits !== undefined ? user.credits : 100;

            sessionStorage.setItem('myPeerId', peer.id);
            // Send the persistent ID along with the username and current credits.
            hostConnection.send({
                type: 'user-reconnected',
                payload: {
                    username: username,
                    persistentId: persistentId,
                    credits: credits
                }
            });
        });

        hostConnection.on('data', (data) => {
            console.log('Received data from host:', data);
            handleHostMessage(data);
        });

        hostConnection.on('error', (err) => {
            console.error('Connection error:', err);
            showModalMessage('Failed to connect to host. The session may be full or no longer exist.');
            window.location.href = 'index.html';
        });

        hostConnection.on('close', () => {
            console.log('Connection to host closed.');
            showModalMessage('This gwamble is over! You have been disconnected.');
            sessionStorage.clear();
            window.location.href = 'index.html';
        });
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
            showModalMessage(`Couldn't join that gwamble, sorry. Something went wrong.`);
        } else {
            showModalMessage('An error occurred. Could not join the session.');
        }
        window.location.href = 'index.html';
    });
}

/**
 * (Peer Only) Handles messages received from the host.
 * @param {object} data The data object from the host.
 */
function handleHostMessage(data) {
    const { type, payload } = data;

    // Initialize sessionData if it's the first message
    if (!sessionData && type === 'session-data') {
        sessionData = payload;
    } else if (!sessionData) {
        // If sessionData is not set yet and we receive another message type, we probably missed the initial data.
        // We can either request it again or wait. For now, we'll just log a warning.
        console.warn("Received message before session data was initialized. Type: ", type);
        return;
    }

    switch (type) {
        case 'session-data':
            // Already handled, but we can merge just in case
            sessionData = { ...sessionData, ...payload };
            break;
        case 'user-list':
            sessionData.members = payload.users.map(u => ({
                user_id: u.peerId, // Keep peerId as the primary key for UI elements
                persistent_id: u.persistentId, // Store the persistent ID
                username: u.username,
                is_host: u.peerId === sessionStorage.getItem('gwamble_join_code')
            }));
            break;
        case 'user-joined':
            if (!sessionData.members.find(m => m.user_id === payload.peerId)) {
                sessionData.members.push({
                    user_id: payload.peerId,
                    persistent_id: payload.persistentId, // Store the persistent ID
                    username: payload.username,
                    is_host: false,
                    credits: payload.credits // --- FIX: Store credits for new user ---
                });
            }
            break;
        case 'user-left':
            sessionData.members = sessionData.members.filter(m => m.user_id !== payload.peerId);
            break;
        case 'bets-updated':
            sessionData.bets = payload.bets;
            break;
        case 'winner-declared':
            // The host now calculates credits and sends a separate 'credits-updated' message.
            // The peer just needs to know the winner for UI purposes.
            sessionData.winner = payload.winner;
            break;
        case 'credits-updated':
            // Update local credits for all users and localStorage
            if (sessionData && sessionData.members) {
                Object.entries(payload.userCredits).forEach(([user_id, credits]) => {
                    let m = sessionData.members.find(m => m.user_id === user_id);
                    if (m) {
                        m.credits = credits;
                        // Store the credit change for this user
                        if (payload.creditChanges && payload.creditChanges[user_id] !== undefined) {
                            m.creditChange = payload.creditChanges[user_id];
                        }
                    }
                    // If this is me, update my localStorage too
                    const myId = localStorage.getItem('gwamble_persistent_user_id');
                    if (user_id === myId) {
                        console.log(`UPDATING MY CREDITS: ${credits} for user ${myId}`);
                        let user = JSON.parse(localStorage.getItem('gwambleUser') || '{}');
                        user.credits = credits;
                        localStorage.setItem('gwambleUser', JSON.stringify(user));
                        console.log('Updated localStorage:', localStorage.getItem('gwambleUser'));
                        
                        // FORCE UPDATE PROFILE PAGE IF IT EXISTS
                        if (typeof updateCreditsDisplay === 'function') {
                            updateCreditsDisplay();
                        }
                    }
                });
            }
            break;
        default:
            console.warn('Unknown message type from host:', type);
            return; 
    }

    if (uiUpdateCallback) {
        uiUpdateCallback(sessionData);
    }
}


/**
 * (Peer Only) Sends a bet to the host.
 * @param {string} outcome The outcome being bet on ('a' or 'b').
 */
function sendBet(outcome) {
    console.log('sendBet called with outcome:', outcome);
    
    if (!hostConnection) {
        console.error("Cannot send bet, not connected to host.");
        return;
    }

    const persistentId = localStorage.getItem('gwamble_persistent_user_id');
    if (!persistentId) {
        console.error("Cannot send bet, no persistent user ID found.");
        return;
    }

    console.log('sendBet: About to send bet to host');

    const betInfo = {
        userId: persistentId,
        outcome: outcome,
        amount: 10
    };

    hostConnection.send({ type: 'bet-placed', payload: { betInfo: betInfo } });
}

/**
 * (Peer Only) Disconnects from the host and cleans up the peer object.
 */
function disconnectFromHost() {
    if (hostConnection) {
        hostConnection.close();
    }
    if (peer) {
        peer.destroy();
    }
    console.log("Disconnected from host.");
}

/**
 * (Host only) Broadcasts a message to all connected peers.
 * @param {object} message The message to send.
 * @param {string} [excludePeerId] Optional. A peer ID to exclude from the broadcast.
 */
function broadcastMessage(message, excludePeerId) {
    console.log(`Broadcasting message to ${peerConnections.length} peers:`, message);
    peerConnections.forEach(conn => {
        if (conn.open && conn.peer !== excludePeerId) {
            conn.send(message);
        }
    });
}

/**
 * (Host only) Kicks a specific peer.
 * @param {string} peerId The ID of the peer to kick.
 */
function kickPeerConnection(peerId) {
    const conn = peerConnections.find(p => p.peer === peerId);
    if (conn) {
        console.log(`Kicking peer ${peerId}`);
        // 1. Send a kick message to the peer so they can display a message.
        conn.send({ type: 'kicked' });
        
        // 2. Close the connection after a short delay to allow message to send.
        setTimeout(() => conn.close(), 500);
        
        // 3. The regular 'close' event handler will fire, which already broadcasts
        //    the 'user-left' message, so no need to do it here.
    }
}

/**
 * (Host only) Handles messages received from peers.
 * This is where the host logic for updating the session state lives.
 * It dispatches a custom event that the session.html page can listen to.
 * @param {object} data The data object from the peer.
 */
function handleMessage(data) {
    console.log("Dispatching gwamble-message event with data:", data);
    const event = new CustomEvent('gwamble-message', { detail: data });
    window.dispatchEvent(event);
}

// Show a modal message (UIkit or fallback to alert)
function showModalMessage(msg) {
    if (window.UIkit && UIkit.modal) {
        UIkit.modal.alert(`<div style='font-family:Lexend;font-size:20px;text-align:center;'>${msg}</div>`);
    } else {
        alert(msg);
    }
}

window.addEventListener('beforeunload', () => {
    // Also clear the timer when the page is closed.
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    if (peer) {
        console.log('Destroying peer object.');
        peer.destroy();
    }
});
