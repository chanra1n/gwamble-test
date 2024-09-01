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
    updateGwambleParticipants("KWR3P9EEQ6C9Q1VA", null, 10);
    updateGwambleParticipants("4C7PBBI0GR6VR353", null, 10);
}

function fakeSessionBetTests() {
    updateGwambleParticipants("FSDVL5QS366PGQ0B", "A", 10);
    updateGwambleParticipants("KWR3P9EEQ6C9Q1VA", "A", 10);
    updateGwambleParticipants("4C7PBBI0GR6VR353", "B", 10);
}