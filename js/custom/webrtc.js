// js/custom/webrtc.js

let peer;
let hostConnection; // For peers, the connection to the host
const peerConnections = []; // For the host, all connections to peers

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
        alert('An error occurred while trying to host the session. The join code might already be in use. Please try again.');
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

    if (peer) {
        peer.destroy();
    }

    peer = new Peer(joinCode);

    peer.on('open', (id) => {
        console.log('Host connection re-established with ID: ' + id);
        // Dispatch event for host to add themself to UI
        handleMessage({ type: 'host-ready', payload: { peerId: id, username: getLocalUsername() } });
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
        });

        conn.on('data', (data) => {
            if (data.type === 'user-reconnected') {
                conn.username = data.payload.username;
                const joinPayload = { peerId: conn.peer, username: data.payload.username };

                // Announce the new user to all *other* peers
                const newUserMessage = { type: 'user-joined', payload: joinPayload };
                broadcastMessage(newUserMessage, conn.peer); // Exclude the new peer
                handleMessage(newUserMessage); // Host updates its own UI

                // Send the full list of users (including the new one) back to the new peer
                const allUsers = peerConnections
                    .map(p => ({ peerId: p.peer, username: p.username }))
                    .filter(p => p.username); // Only include users who have announced themselves
                
                // Add host to the list
                allUsers.push({ peerId: peer.id, username: getLocalUsername() });

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
                    const userLeftMessage = { type: 'user-left', payload: { peerId: leavingPeer.peer, username: leavingPeer.username } };
                    handleMessage(userLeftMessage);
                    broadcastMessage(userLeftMessage);
                }
            }
        });
    });
}

function handleBetPlaced(betInfo) {
    let session = JSON.parse(sessionStorage.getItem('gwamble'));
    if (!session) return;

    const existingBetIndex = session.bets.findIndex(b => b.user_id === betInfo.userId);

    if (existingBetIndex !== -1) {
        session.bets[existingBetIndex] = {
            user_id: betInfo.userId,
            selected_outcome: betInfo.outcome,
            bet_amount: betInfo.amount
        };
    } else {
        session.bets.push({
            user_id: betInfo.userId,
            selected_outcome: betInfo.outcome,
            bet_amount: betInfo.amount
        });
    }

    sessionStorage.setItem('gwamble', JSON.stringify(session));

    // Broadcast the entire updated bets array to all clients for consistency
    broadcastMessage({ type: 'bets-updated', payload: { bets: session.bets } });
    // Also update the host's own UI directly
    handleMessage({ type: 'bets-updated', payload: { bets: session.bets } });
}


/**
 * Connects a peer to a host and redirects to the session page upon success.
 * @param {string} hostId The 6-digit code of the host to connect to.
 */
function joinAndRedirect(hostId) {
    if (peer) {
        peer.destroy();
    }
    
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('My PeerJS ID is ' + id + ', connecting to host ' + hostId);
        hostConnection = peer.connect(hostId, { reliable: true });

        hostConnection.on('open', () => {
            console.log('Connection to host established. Waiting for session data...');
        });

        hostConnection.on('data', (data) => {
            if (data.type === 'session-data') {
                console.log('Received session data, joining session...');
                sessionStorage.setItem('gwamble', JSON.stringify(data.payload));
                sessionStorage.setItem('hostPeerId', hostId);
                sessionStorage.setItem('myPeerId', peer.id);
                window.location.href = 'session.html';
            }
        });

        hostConnection.on('error', (err) => {
            console.error('Connection error:', err);
            alert('Failed to connect to host. The session may be full or no longer exist.');
            window.location.href = 'index.html';
        });
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
            alert('Could not find the session. Please check the code and try again.');
        } else {
            alert('An error occurred. Could not join the session.');
        }
        window.location.href = 'index.html';
    });
}

/**
 * (Peer Only) Re-establishes a connection for a peer when they load the session page.
 */
function reestablishPeerConnection() {
    const myId = sessionStorage.getItem('myPeerId');
    const hostId = sessionStorage.getItem('hostPeerId');

    if (!myId || !hostId) {
        console.error("Peer or Host ID not found in session storage.");
        window.location.href = 'index.html';
        return;
    }

    if (peer) {
        peer.destroy();
    }

    peer = new Peer(myId);

    peer.on('open', () => {
        console.log('Re-establishing connection to host ' + hostId);
        hostConnection = peer.connect(hostId, { reliable: true });
        hostConnection.on('open', () => {
            console.log('Reconnected to host.');
            sendMessageToHost({ type: 'user-reconnected', payload: { peerId: myId, username: getLocalUsername() } });
        });
        hostConnection.on('data', handleMessage);
        hostConnection.on('close', () => {
            alert('Connection to the host has been lost.');
            window.location.href = 'index.html';
        });
    });
}

/**
 * Dispatches a custom event to be handled by the session page UI.
 * @param {object} message The data received from a peer or host.
 */
function handleMessage(message) {
    console.log('Dispatching message to UI:', message);
    window.dispatchEvent(new CustomEvent('gwamble-message', { detail: message }));
}

/**
 * (Host only) Sends a message to all connected peers.
 * @param {object} message The message to broadcast.
 * @param {string} [excludePeerId] - Optional peer ID to exclude from the broadcast.
 */
function broadcastMessage(message, excludePeerId) {
    console.log('Broadcasting message:', message);
    peerConnections.forEach(conn => {
        if (conn.open && conn.peer !== excludePeerId) {
            conn.send(message);
        }
    });
}

/**
 * (Peer only) Sends a message to the host.
 * @param {object} message The message to send.
 */
function sendMessageToHost(message) {
    console.log('Sending message to host:', message);
    if (hostConnection && hostConnection.open) {
        hostConnection.send(message);
    } else {
        console.error("Cannot send message, not connected to host.");
    }
}

window.addEventListener('beforeunload', () => {
    if (peer) {
        console.log('Destroying peer object.');
        peer.destroy();
    }
});
