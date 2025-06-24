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
            if (onError) onError({ type: 'peer-unavailable', message: `That gwamble doesn't exist, sorry. Try a different code.` });
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
 */
function initializeHostAndRedirect(joinCode) {
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
            peerConnections.push(conn);
            // A peer has joined, so the session is active. Reset the timer.
            resetInactivityTimer();
        });

        conn.on('data', (data) => {
            if (data.type === 'user-reconnected') {
                // A peer has (re)connected and announced themselves.
                // Store their info on the connection object.
                conn.username = data.payload.username;
                conn.persistentId = data.payload.persistentId; // Store persistent ID

                const joinPayload = {
                    peerId: conn.peer,
                    username: data.payload.username,
                    persistentId: data.payload.persistentId // Include in broadcast
                };

                // Announce the new user to all *other* peers
                const newUserMessage = { type: 'user-joined', payload: joinPayload };
                broadcastMessage(newUserMessage, conn.peer); // Exclude the new peer
                handleMessage(newUserMessage); // Host updates its own UI

                // Send the full list of users (including the new one) back to the new peer
                const allUsers = peerConnections
                    .map(p => ({
                        peerId: p.peer,
                        username: p.username,
                        persistentId: p.persistentId // Send persistent IDs to new peer
                    }))
                    .filter(p => p.username); // Only include users who have announced themselves

                // Add host to the list
                allUsers.push({
                    peerId: peer.id,
                    username: getLocalUsername(),
                    persistentId: localStorage.getItem('gwamble_persistent_user_id') // Add host's persistent ID
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

/**
 * (Peer Only) Sends a bet to the host.
 * @param {string} outcome The selected outcome ('a' or 'b').
 */
function sendBet(outcome) {
    if (!hostConnection) {
        console.error("Cannot send bet, not connected to host.");
        return;
    }

    const persistentId = localStorage.getItem('gwamble_persistent_user_id');
    if (!persistentId) {
        console.error("Cannot send bet, no persistent user ID found.");
        return;
    }

    const betInfo = {
        userId: persistentId, // Use the persistent ID for the bet
        outcome: outcome,
        amount: 10 // Fixed bet amount
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
            sessionStorage.setItem('myPeerId', peer.id);
            // Send the persistent ID along with the username.
            hostConnection.send({
                type: 'user-reconnected',
                payload: {
                    username: username,
                    persistentId: persistentId
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
            showModalMessage('The host has ended the session.');
            sessionStorage.clear();
            window.location.href = 'index.html';
        });
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
            showModalMessage('Could not find the session. Please check the code and try again.');
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
                    is_host: false
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
            sessionData.winner = payload.winner;
            // The UI callback will now handle showing the results screen
            break;
        case 'kicked':
            showModalMessage('You have been kicked from the session by the host.');
            disconnectFromHost();
            window.location.href = 'index.html';
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
    if (!hostConnection) {
        console.error("Cannot send bet, not connected to host.");
        return;
    }

    const persistentId = localStorage.getItem('gwamble_persistent_user_id');
    if (!persistentId) {
        console.error("Cannot send bet, no persistent user ID found.");
        return;
    }

    const betInfo = {
        userId: persistentId, // Use the persistent ID for the bet
        outcome: outcome,
        amount: 10 // Fixed bet amount
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
