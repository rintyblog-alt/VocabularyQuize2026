/**
 * BeanCharacter.js — Fall Guys-style bean character (Three.js)
 */
const T = () => window.THREE;

export const BEAN_PALETTE = [
  "#ff6b9d", "#7c4dff", "#00d4ff", "#00e676", "#ffb400", "#ff5252"
];

/**
 * Creates a bean character Group.
 * @param {string} color - hex color
 * @returns {{ group, parts, update(elapsed, state) }}
 */
export function createBeanCharacter(color) {
  const THREE = T();
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.55, 16, 14);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.y = 1.15;
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.38, 14, 12);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.38;
  head.castShadow = true;
  group.add(head);

  // Eyes + pupils
  const eyeGeo = new THREE.SphereGeometry(0.09, 8, 8);
  const pupilGeo = new THREE.SphereGeometry(0.045, 8, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, whiteMat);
    eye.position.set(0.14 * side, 1.44, 0.32);
    group.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, blackMat);
    pupil.position.set(0.14 * side, 1.44, 0.38);
    group.add(pupil);
  }

  // Legs
  const legGeoL = new THREE.CylinderGeometry(0.14, 0.16, 0.45, 8);
  const legL = new THREE.Mesh(legGeoL, bodyMat);
  legL.position.set(-0.22, 0.2, 0);
  legL.castShadow = true;
  group.add(legL);

  const legGeoR = new THREE.CylinderGeometry(0.14, 0.16, 0.45, 8);
  const legR = new THREE.Mesh(legGeoR, bodyMat);
  legR.position.set(0.22, 0.2, 0);
  legR.castShadow = true;
  group.add(legR);

  // Feet
  const footGeo = new THREE.SphereGeometry(0.18, 8, 8);
  const footL = new THREE.Mesh(footGeo, whiteMat);
  footL.scale.set(1.2, 0.7, 1.4);
  footL.position.set(-0.22, -0.02, 0.1);
  group.add(footL);

  const footR = new THREE.Mesh(footGeo.clone(), whiteMat);
  footR.scale.set(1.2, 0.7, 1.4);
  footR.position.set(0.22, -0.02, 0.1);
  group.add(footR);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.rotation.z = -0.5;
  armL.position.set(-0.65, 0.75, 0);
  armL.castShadow = true;
  group.add(armL);

  const armR = new THREE.Mesh(armGeo.clone(), bodyMat);
  armR.rotation.z = 0.5;
  armR.position.set(0.65, 0.75, 0);
  armR.castShadow = true;
  group.add(armR);

  const parts = { body, head, legL, legR, footL, footR, armL, armR };

  let knockbackTilt = 0;

  /**
   * @param {number} elapsed - total elapsed seconds
   * @param {{ moving: boolean, knockback?: number }} state
   */
  function update(elapsed, state = {}) {
    const t = elapsed * 6;
    const moving = !!state.moving;

    if (moving) {
      // Running bob
      const bob = Math.abs(Math.sin(t)) * 0.18;
      body.position.y = 0.62 + bob * 0.5;
      head.position.y = 1.38 + bob;
      // Leg swing
      const swing = Math.sin(t) * 0.5;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      footL.position.z = 0.1 + Math.sin(t) * 0.12;
      footR.position.z = 0.1 - Math.sin(t) * 0.12;
      // Arm swing (opposite)
      armL.rotation.x = -swing * 0.6;
      armR.rotation.x = swing * 0.6;
    } else {
      // Idle gentle bob
      const idle = Math.sin(elapsed * 2) * 0.05;
      body.position.y = 0.62 + idle;
      head.position.y = 1.38 + idle;
      legL.rotation.x = 0;
      legR.rotation.x = 0;
      footL.position.z = 0.1;
      footR.position.z = 0.1;
      armL.rotation.x = Math.sin(elapsed * 1.4) * 0.1;
      armR.rotation.x = -Math.sin(elapsed * 1.4) * 0.1;
    }

    // Knockback
    if (typeof state.knockback === "number" && state.knockback !== 0) {
      knockbackTilt = state.knockback * 0.6;
    }
    if (Math.abs(knockbackTilt) > 0.01) {
      group.rotation.z = knockbackTilt;
      knockbackTilt *= 0.92;
    } else {
      knockbackTilt = 0;
      group.rotation.z = 0;
    }
  }

  return { group, parts, update };
}

/**
 * Dispose all geometries and materials in the character group
 */
export function disposeBeanCharacter(bean) {
  bean.group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  if (bean.group.parent) bean.group.parent.remove(bean.group);
}
