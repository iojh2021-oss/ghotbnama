/* Pure helpers: tilt-compensated heading, bearing, distance.
   Works in the browser (window.CompassMath) and in Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompassMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RAD = Math.PI / 180;

  function norm(a) {
    return ((a % 360) + 360) % 360;
  }

  /* Signed shortest difference to - from, in [-180, 180). Positive = clockwise. */
  function signedDiff(to, from) {
    return ((norm(to - from) + 180) % 360) - 180;
  }

  /* Heading (0 = north, clockwise) of the direction the screen's top edge points,
     blended with the direction the back of the phone faces, so it stays stable
     both when the phone is flat and when it is held upright.
     alpha/beta/gamma: W3C DeviceOrientation angles in degrees (absolute).
     screenAngle: screen.orientation.angle (0, 90, 180, 270). */
  function headingFromEuler(alpha, beta, gamma, screenAngle) {
    var z = (alpha || 0) * RAD;
    var x = (beta || 0) * RAD;
    var y = (gamma || 0) * RAD;
    var cZ = Math.cos(z), sZ = Math.sin(z);
    var cX = Math.cos(x), sX = Math.sin(x);
    var cY = Math.cos(y), sY = Math.sin(y);

    /* Device axes expressed in the earth frame (East, North, Up). */
    var Xe = [cZ * cY - sZ * sX * sY, sZ * cY + cZ * sX * sY];
    var Ye = [-sZ * cX, cZ * cX];
    var Ze = [cZ * sY + sZ * sX * cY, sZ * sY - cZ * sX * cY];

    var a = norm(screenAngle || 0);
    var up;
    if (a === 90) up = Xe;
    else if (a === 180) up = [-Ye[0], -Ye[1]];
    else if (a === 270) up = [-Xe[0], -Xe[1]];
    else up = Ye;

    /* Screen-top direction + back-of-phone direction (-Z), horizontal parts. */
    var vx = up[0] - Ze[0];
    var vy = up[1] - Ze[1];
    if (Math.hypot(vx, vy) < 0.1) return null; /* screen facing down / ambiguous */
    return norm(Math.atan2(vx, vy) / RAD);
  }

  /* Initial great-circle bearing from point 1 to point 2, degrees from true north. */
  function bearingTo(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return norm(Math.atan2(y, x) / RAD);
  }

  /* Great-circle distance in kilometres (haversine). */
  function distanceKm(lat1, lon1, lat2, lon2) {
    var R = 6371.0088;
    var dp = (lat2 - lat1) * RAD, dl = (lon2 - lon1) * RAD;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  return {
    norm: norm,
    signedDiff: signedDiff,
    headingFromEuler: headingFromEuler,
    bearingTo: bearingTo,
    distanceKm: distanceKm
  };
});
