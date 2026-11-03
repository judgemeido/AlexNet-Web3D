import {Box3, Vector3} from 'three';

export function planExhibitCells(entries, aspect) {
  if (!entries.length) return {cells: [], width: 0, height: 0};
  const columns = aspect < 1.05 ? 2 : 3;
  const gapX = 1.3;
  const gapY = 2.7;
  const rows = [];
  for (let offset = 0; offset < entries.length; offset += columns) {
    const items = entries.slice(offset, offset + columns);
    rows.push({items, width: items.reduce((sum, entry) => sum + entry.width, 0) + gapX * (items.length - 1), height: Math.max(...items.map(entry => entry.height))});
  }
  const width = Math.max(...rows.map(row => row.width));
  const height = rows.reduce((sum, row) => sum + row.height, 0) + gapY * (rows.length - 1);
  const cells = [];
  let top = height / 2;
  for (const row of rows) {
    let left = -row.width / 2;
    for (const item of row.items) {
      cells.push({key: item.key, x: left + item.width / 2, y: top - row.height / 2, width: item.width, height: item.height});
      left += item.width + gapX;
    }
    top -= row.height + gapY;
  }
  return {cells, width, height};
}

export function createExhibitLayout() {
  const bounds = new Box3();
  const right = new Vector3();
  const up = new Vector3();
  const view = new Vector3();
  const cameraForward = new Vector3();
  const center = new Vector3();
  const extent = new Vector3();
  const layoutRight = new Vector3();
  const layoutUp = new Vector3();
  const layoutView = new Vector3();
  const layoutTarget = new Vector3();
  let measured = [];
  let layout = {cells: [], width: 0, height: 0};
  let layoutBasisReady = false;

  function measure(groups) {
    layoutBasisReady = false;
    measured = groups.map(group => {
      group.updateWorldMatrix(true, true);
      bounds.setFromObject(group);
      const localCenter = bounds.getCenter(new Vector3()).sub(group.position);
      const size = bounds.getSize(new Vector3());
      return {group, key: group.userData.key, center: localCenter, size, base: group.position.clone()};
    });
  }

  function update(camera, target, amount, isolated, freezeBasis = false) {
    camera.updateMatrixWorld();
    layoutTarget.copy(target);
    cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    view.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
    if (!freezeBasis) layoutBasisReady = false;
    if (freezeBasis && !layoutBasisReady && (amount > .001 || isolated)) {
      layoutRight.copy(right);
      layoutUp.copy(up);
      layoutView.copy(view);
      layoutBasisReady = true;
    }
    const basisRight = freezeBasis && layoutBasisReady ? layoutRight : right;
    const basisUp = freezeBasis && layoutBasisReady ? layoutUp : up;
    const basisView = freezeBasis && layoutBasisReady ? layoutView : view;
    const entries = measured.map(entry => {
      extent.copy(entry.size).multiplyScalar(.5);
      const width = 2 * (Math.abs(basisRight.x) * extent.x + Math.abs(basisRight.y) * extent.y + Math.abs(basisRight.z) * extent.z);
      const height = 2 * (Math.abs(basisUp.x) * extent.x + Math.abs(basisUp.y) * extent.y + Math.abs(basisUp.z) * extent.z);
      return {...entry, width: width * 1.35 + .45, height: height * 1.35 + .45};
    });
    layout = planExhibitCells(entries, camera.aspect);
    layout.cells.forEach((cell, index) => {
      const entry = measured[index];
      const depthOffset = amount > .001 ? (index - (measured.length - 1) / 2) * 1.5 : 0;
      center.copy(target).addScaledVector(basisRight, cell.x).addScaledVector(basisUp, cell.y).addScaledVector(basisView, depthOffset).sub(entry.center);
      entry.group.position.lerpVectors(entry.base, center, amount);
      entry.group.visible = !isolated || entry.key === isolated;
    });
    if (isolated) {
      const entry = measured.find(item => item.key === isolated);
      if (entry) entry.group.position.copy(target).sub(entry.center);
    }
    return layout;
  }

  function distance(camera, isolated, padding = 8) {
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
    const halfVertical = camera.fov * Math.PI / 360;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(camera.aspect, .1));
    const selected = isolated ? measured.filter(entry => entry.key === isolated) : measured;
    if (!selected.length) return 8;
    let minRight = Infinity, maxRight = -Infinity, minUp = Infinity, maxUp = -Infinity, maxDepth = 0;
    selected.forEach(entry => {
      entry.group.updateWorldMatrix(true, true);
      bounds.setFromObject(entry.group);
      for (const xPosition of [bounds.min.x, bounds.max.x]) for (const yPosition of [bounds.min.y, bounds.max.y]) for (const zPosition of [bounds.min.z, bounds.max.z]) {
        view.set(xPosition, yPosition, zPosition).sub(layoutTarget);
        const rightDistance = view.dot(right);
        const upDistance = view.dot(up);
        const depthDistance = Math.abs(view.dot(cameraForward));
        minRight = Math.min(minRight, rightDistance);
        maxRight = Math.max(maxRight, rightDistance);
        minUp = Math.min(minUp, upDistance);
        maxUp = Math.max(maxUp, upDistance);
        maxDepth = Math.max(maxDepth, depthDistance);
      }
    });
    const width = maxRight - minRight;
    const height = maxUp - minUp;
    const fit = Math.max(width / (2 * Math.tan(halfHorizontal)), height / (2 * Math.tan(halfVertical)), maxDepth * .72);
    return fit * (isolated ? 1.22 : 1.25) + (isolated ? 2.4 : padding);
  }

  function projection(camera, width, height) {
    camera.updateMatrixWorld();
    return measured.filter(entry => entry.group.visible).map(entry => {
      entry.group.updateWorldMatrix(true, true);
      bounds.setFromObject(entry.group);
      const screenBounds = {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity};
      for (const xPosition of [bounds.min.x, bounds.max.x]) for (const yPosition of [bounds.min.y, bounds.max.y]) for (const zPosition of [bounds.min.z, bounds.max.z]) {
        center.set(xPosition, yPosition, zPosition).project(camera);
        const xScreen = (center.x + 1) * width / 2;
        const yScreen = (1 - center.y) * height / 2;
        screenBounds.left = Math.min(screenBounds.left, xScreen);
        screenBounds.right = Math.max(screenBounds.right, xScreen);
        screenBounds.top = Math.min(screenBounds.top, yScreen);
        screenBounds.bottom = Math.max(screenBounds.bottom, yScreen);
      }
      return {key: entry.key, ...screenBounds};
    });
  }

  function resetBasis() {
    layoutBasisReady = false;
  }

  return {measure, update, distance, projection, resetBasis};
}
