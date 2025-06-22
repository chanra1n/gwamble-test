class GwambleSession {
    constructor(hostId, subject, outcomeA, outcomeB) {
        this.hostId = hostId;
        this.subject = subject;
        this.outcomeA = outcomeA;
        this.outcomeB = outcomeB;
        this.peers = [];
        this.bets = {}; // Using an object to map peerId to their bet
        this.startTime = Date.now();
        this.winner = null;
    }

    addPeer(peerId) {
        if (this.peers.indexOf(peerId) === -1) {
            this.peers.push(peerId);
        }
    }

    removePeer(peerId) {
        this.peers = this.peers.filter(p => p !== peerId);
        delete this.bets[peerId];
    }

    placeBet(peerId, outcome) {
        // Only allow bets if the session is active and no winner has been declared
        if (!this.winner && (Date.now() - this.startTime) < 600000) { // 10 minutes
            this.bets[peerId] = outcome;
            return true;
        }
        return false;
    }

    declareWinner(outcome) {
        if (!this.winner) {
            this.winner = outcome;
            this.calculateWinnings();
            return true;
        }
        return false;
    }

    calculateWinnings() {
        const winningBets = [];
        const losingBets = [];

        for (const peerId in this.bets) {
            if (this.bets[peerId] === this.winner) {
                winningBets.push(peerId);
            } else {
                losingBets.push(peerId);
            }
        }

        // For simplicity, let's say winners get 10 credits each.
        // This can be adjusted based on your credit system logic.
        // We'll need a way to communicate these winnings back to the users.
    }

    getStateForPeer() {
        return {
            subject: this.subject,
            outcomeA: this.outcomeA,
            outcomeB: this.outcomeB,
            bets: this.bets,
            winner: this.winner,
            startTime: this.startTime
        };
    }
}
