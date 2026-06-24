/* global CURRENT_DIR FILE_PATH DIRECTORY_PATH */

import { ROOT, pathJoin } from '../utils.js';

const QUANTITY = 20;
var end = 0;

/**
 * Calculate the full document height in pixels.
 *
 * @returns {number} The calculated document height in pixels.
 */
function height() {
  var body = document.body;
  var html = document.documentElement;
  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight,
  );
}

/**
 * Creates a list of files and directories and appends it to the file and
 * directory section of the page.
 * Uses global `FILE_PATH`, `DIRECTORY_PATH`, and `ROOT`.
 *
 * @param {Object} item - The directory entry to render.
 * @param {string} item.name - The name of the file or directory.
 * @param {string} item.type - Either 'file' or another type (e.g. 'directory').
 * @param {string} [item.path] - Optional path prefix for the entry.
 */
function addItem(item) {
  const $LIST_Element = $('<li></li>');
  const $ITEM_ELEMENT = $('<a></a>');
  const ITEM_TEXT = document.createTextNode(item.name);
  const PATH_CATEGORY = item.type == 'file' ? FILE_PATH : DIRECTORY_PATH;
  const RELATIVE_PATH =
    item.path == ROOT ? item.name : pathJoin([item.path, item.name]);

  $ITEM_ELEMENT.attr('href', PATH_CATEGORY.replace('TEMP', RELATIVE_PATH));
  $ITEM_ELEMENT.append(ITEM_TEXT);
  $LIST_Element.append($ITEM_ELEMENT);

  if (!$(`#${item.type}s`).length) {
    $('#contents').append(
      $(
        `<div class="column">
        <h2>${item.type == 'dir' ? 'Directories' : 'Files'}</h2>
        <ul id="${item.type}s"></ul>
        </div>`,
      ),
    );
  }
  $(`#${item.type}s`).append($LIST_Element);
}

/**
 * Load the next batch of files/directories from the server and append them
 * to the appropriate lists in the DOM.
 * Uses global `end`, `CURRENT_DIR` and `QUANTITY` to page through results.
 *
 * This function will recursively call itself if the newly loaded content
 * does not fill the viewport (so more content needs to be fetched).
 */
function loadData() {
  const START = end;
  var items_added = false;
  end += QUANTITY;

  fetch(`/browser/file_request?start=${START}&end=${end}&path=${CURRENT_DIR}`)
    .then((response) => response.json())
    .then((data) => {
      data.dirs.forEach(addItem);
      data.files.forEach(addItem);

      items_added = Math.max(data.dirs.length, data.files.length) != 0;
    })
    .then(() => {
      if (window.innerHeight == height() && items_added) {
        loadData();
      }
    })
    .then(() => {
      if (!items_added && !$('#dirs').length && !$('#files').length) {
        $('#contents').append('<div>Empty Directory</div>');
      }
    });
}

/**
 * Render the current directory path as a heading inside the element with id
 * `CURRENT_DIR`.
 * If the current directory is the root, the text 'Root' is shown instead.
 * Uses global `CURRENT_DIR`.
 */
function setCurrentDir() {
  const $HEADING_ELEMENT = $('<h1></h1>');
  const HEADING_TEXT = document.createTextNode(
    CURRENT_DIR == ROOT ? 'Root' : CURRENT_DIR,
  );
  $HEADING_ELEMENT.append(HEADING_TEXT);
  $(`#current-dir`).append($HEADING_ELEMENT);
}

document.addEventListener('DOMContentLoaded', () => {
  setCurrentDir();
  loadData();
});

window.onscroll = () => {
  if (window.innerHeight + window.scrollY >= height() - 1) {
    loadData();
  }
};
