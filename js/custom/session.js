class GwambleSession {
    constructor(hostId, hostUsername, subject, outcomeA, outcomeB) {
        this.hostId = hostId;
        this.hostUsername = hostUsername;
        this.subject = subject;
        this.outcomeA = outcomeA;
        this.outcomeB = outcomeB;
        this.members = []; // Changed from peers to members for clarity
        this.bets = []; // Changed from object to array to fix length/filter issues
        this.startTime = Date.now();
        this.winner = null;
    }

    addMember(peerId, username) {
        if (!this.members.find(m => m.user_id === peerId)) {
            this.members.push({ user_id: peerId, username: username, is_host: false });
        }
    }

    removeMember(peerId) {
        this.members = this.members.filter(m => m.user_id !== peerId);
    }

    updateBet(userId, username, outcome, amount) {
        const existingBetIndex = this.bets.findIndex(b => b.user_id === userId);
        const bet = { user_id: userId, username: username, selected_outcome: outcome, bet_amount: amount };

        if (existingBetIndex !== -1) {
            this.bets[existingBetIndex] = bet;
        } else {
            this.bets.push(bet);
        }
    }

    // Helper to get the initial state for a new peer
    getState() {
        return {
            hostUsername: this.hostUsername,
            subject: this.subject,
            outcomeA: this.outcomeA,
            outcomeB: this.outcomeB,
            members: this.members,
            bets: this.bets,
            winner: this.winner
        };
    }
}
