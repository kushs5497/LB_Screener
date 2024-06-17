const resizer = document.getElementById('dragMe');
const leftSide = document.getElementById('side-panel');
const mapDiv = document.getElementById('map');

let startX = 0;
let startWidth = 0;

const mouseDownHandler = function (e) {
    startX = e.clientX;
    startWidth = parseInt(document.defaultView.getComputedStyle(leftSide).width, 10);

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
};

resizer.addEventListener('mousedown', mouseDownHandler);

const mouseMoveHandler = function (e) {
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;

    if (newWidth > 100 && newWidth < window.innerWidth - 100) {
        leftSide.style.width = `${newWidth}px`;
        mapDiv.style.left = `${newWidth}px`; // Move the map along with the side panel
        resizer.style.left = `${newWidth}px`; // Move the resizer along with the side panel
    }

    resizer.style.cursor = 'col-resize';
    document.body.style.cursor = 'col-resize';
    leftSide.style.userSelect = 'none';
    leftSide.style.pointerEvents = 'none';
};

const mouseUpHandler = function () {
    resizer.style.removeProperty('cursor');
    document.body.style.removeProperty('cursor');
    leftSide.style.removeProperty('user-select');
    leftSide.style.removeProperty('pointer-events');

    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
};
