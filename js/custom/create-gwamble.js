document.addEventListener('DOMContentLoaded', () => {
    const createGwambleContainer = document.getElementById('create-gwamble-container');
    const createGwambleButton = document.getElementById('create-gwamble-post-button');
    const cancelGwambleButton = document.getElementById('cancel-gwamble-post-button');
    const createGwambleOptions = document.getElementById('create-gwamble-options');
    const joinGwambleContainer = document.getElementById('join-gwamble-container');
    const inputs = createGwambleOptions.querySelectorAll('input, textarea');

    function toggleCreateGwamble() {
        const isOpening = !createGwambleContainer.classList.contains('open');

        if (isOpening) {
            createGwambleContainer.classList.add('open');
            joinGwambleContainer.style.display = 'none';
            createGwambleOptions.style.display = 'flex';
        } else {
            createGwambleContainer.classList.remove('open');
            joinGwambleContainer.style.display = 'block';
            createGwambleOptions.style.display = 'none';
        }
    }

    function checkInputs() {
        let allFilled = true;
        inputs.forEach(input => {
            if (input.value.trim() === '') {
                allFilled = false;
            }
        });
        createGwambleButton.disabled = !allFilled;
    }

    function createGwamble() {
        createGwambleButton.classList.add('loading');
        // Simulate network request
        setTimeout(() => {
            createGwambleButton.classList.remove('loading');
            // Replace with actual logic to pass gwamble data
            window.location.href = 'session.html'; 
        }, 1000);
    }

    createGwambleContainer.addEventListener('click', (e) => {
        if (!createGwambleContainer.classList.contains('open')) {
            toggleCreateGwamble();
        }
    });

    cancelGwambleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCreateGwamble();
    });

    createGwambleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        createGwamble();
    });

    inputs.forEach(input => {
        input.addEventListener('input', checkInputs);
    });

    checkInputs();
});
