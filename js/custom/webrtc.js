// webrtc.js

let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;

function createConnection() {
    const servers = null; // Using local network, no STUN/TURN servers needed

    localConnection = new RTCPeerConnection(servers);
    console.log('Created local peer connection object localConnection');

    sendChannel = localConnection.createDataChannel('sendDataChannel');
    console.log('Created send data channel');

    localConnection.onicecandidate = e => {
        onIceCandidate(localConnection, e);
    };

    sendChannel.onopen = onSendChannelStateChange;
    sendChannel.onclose = onSendChannelStateChange;

    localConnection.createOffer().then(
        offer => {
            localConnection.setLocalDescription(offer);
            // Here you would signal the offer to the other peer
            // For this implementation, we'll pass it directly
            // In a real app, this would go over your signaling server (or copy-paste)
            console.log('Offer from localConnection \n', offer.sdp);
            // For local testing, we can simulate the signaling
            // The offer would be sent to the joining peer
        },
        error => {
            console.log('Error creating offer:', error);
        }
    );
}

function onIceCandidate(pc, event) {
    // When a new ICE candidate is found, send it to the other peer
    if (event.candidate) {
        // In a real app, this would be sent to the other peer via signaling
        console.log('ICE candidate:', event.candidate);
    }
}

function onSendChannelStateChange() {
    const readyState = sendChannel.readyState;
    console.log('Send channel state is: ' + readyState);
}

function sendMessage(message) {
    if (sendChannel.readyState === 'open') {
        sendChannel.send(JSON.stringify(message));
    }
}

function setupReceiver(offerSdp) {
    remoteConnection = new RTCPeerConnection(null);
    console.log('Created remote peer connection object remoteConnection');

    remoteConnection.onicecandidate = e => {
        onIceCandidate(remoteConnection, e);
    };

    remoteConnection.ondatachannel = receiveChannelCallback;

    let offer = new RTCSessionDescription({
        type: 'offer',
        sdp: offerSdp
    });

    remoteConnection.setRemoteDescription(offer).then(() => {
        console.log('Set remote description');
        remoteConnection.createAnswer().then(
            answer => {
                remoteConnection.setLocalDescription(answer);
                console.log('Answer from remoteConnection \n', answer.sdp);
                // In a real app, this answer would be sent back to the offering peer
            },
            error => {
                console.log('Error creating answer:', error);
            }
        );
    });
}

function receiveChannelCallback(event) {
    console.log('Receive Channel Callback');
    receiveChannel = event.channel;
    receiveChannel.onmessage = onReceiveMessageCallback;
    receiveChannel.onopen = onReceiveChannelStateChange;
    receiveChannel.onclose = onReceiveChannelStateChange;
}

function onReceiveMessageCallback(event) {
    const message = JSON.parse(event.data);
    console.log('Received Message:', message);
    // Handle received message (e.g., update UI)
    if (message.type === 'bet') {
        // A user has placed a bet
        handleBet(message.data);
    } else if (message.type === 'winner') {
        // The host has declared a winner
        handleWinner(message.data);
    }
}

function onReceiveChannelStateChange() {
    const readyState = receiveChannel.readyState;
    console.log(`Receive channel state is: ${readyState}`);
}

function setAnswer(answerSdp) {
    let answer = new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp
    });
    localConnection.setRemoteDescription(answer).then(() => {
        console.log('Set remote description for local connection');
    });
}

// Functions to be called from other scripts
function hostSession(sessionData) {
    createConnection();
    // The offer SDP will need to be shared with joining peers
}

function joinSession(offerSdp) {
    setupReceiver(offerSdp);
    // The answer SDP will need to be shared with the host
}

function sendBet(betData) {
    sendMessage({ type: 'bet', data: betData });
}

function declareWinner(winnerData) {
    sendMessage({ type: 'winner', data: winnerData });
}
