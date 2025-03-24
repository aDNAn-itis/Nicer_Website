/**
 * Generates a button for a suggested observation ID or source name that the
 * user can click to autocomplete.
 * @param {String} value Observation ID or source name
 * @param {JQuery<HTMLElement>} $container Dropdown container with search field
 * and container for options
 */
export function addOption(value, $container) {
    const $OPTION = $('<button>', { type: 'button', text: value });

    $OPTION.on('click', () => {
        $container.find('.dropdown-field').val(value);
    });

    $container.find('.dropdown-content').append($OPTION);
}

/**
 * Searches for observation IDs and  that match the search field.
 *
 * Creates buttons for each observation ID or source name that matches the
 * search field.
 * @param {String} request Partial or complete observation ID or source name
 * request
 * @param {JQuery<HTMLElement>} $container Dropdown container with search field
 * and container for options
 */
export function fetchOptions(request, $container) {
    fetch(`/plots/fetch_observations?${request}`)
        .then((response) => response.json())
        .then((data) => {
            // Generates buttons for each observation ID that matches the search field
            $container.find('.dropdown-content').html('');
            data.dir_suggestions.forEach((value) => addOption(value, $container));
        });
}