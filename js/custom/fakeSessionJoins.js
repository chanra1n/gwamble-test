var fakeUserDB = [
    {
        "name": "annoyingorange",
        "token": "FSDVL5QS366PGQ0B",
        "coins": 100
    },
    {
        "name": "j0hnD03",
        "token": "KWR3P9EEQ6C9Q1VA",
        "coins": 100
    },
    {
        "name": "chadlike73",
        "token": "4C7PBBI0GR6VR353",
        "coins": 100
    }
];


function fakeSessionJoinTests() {
    updateGwambleParticipants("FSDVL5QS366PGQ0B", null, 10);
    setTimeout(() => {
        updateGwambleParticipants("KWR3P9EEQ6C9Q1VA", null, 10);
    setTimeout(() => {
        updateGwambleParticipants("4C7PBBI0GR6VR353", null, 10);
    }, Math.random() * 1000);
    }, Math.random() * 1000);
}

function fakeSessionBetTests() {
    updateGwambleParticipants("FSDVL5QS366PGQ0B", getRandomOutcome(), 10);
    setTimeout(() => {
        updateGwambleParticipants("KWR3P9EEQ6C9Q1VA", getRandomOutcome(), 10);
        setTimeout(() => {
            updateGwambleParticipants("4C7PBBI0GR6VR353", getRandomOutcome(), 10);
        }, Math.random() * 1000);
    }, Math.random() * 1000);
}

function getRandomOutcome() {
    var outcomes = ["A", "B"];
    var randomIndex = Math.floor(Math.random() * outcomes.length);
    return outcomes[randomIndex];
}