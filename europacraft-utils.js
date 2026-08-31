(() => {
  'use strict';

  const U = {};

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  U.lerp = (a, b, t) => a + (b - a) * t;

  U.smoothstep = (a, b, x) => {
    if (a === b) {
      return x < a ? 0 : 1;
    }

    const t = U.clamp((x - a) / (b - a), 0, 1);

    return t * t * (3 - 2 * t);
  };

  U.degToRad = d => d * Math.PI / 180;

  U.radToDeg = r => r * 180 / Math.PI;

  U.wrapLon = lon =>
    ((lon + 180) % 360 + 360) % 360 - 180;

  U.haversineKm = (
    lat1,
    lon1,
    lat2,
    lon2
  ) => {
    const R = 6371;

    const p1 = U.degToRad(lat1);
    const p2 = U.degToRad(lat2);

    const dp = U.degToRad(lat2 - lat1);
    const dl = U.degToRad(lon2 - lon1);

    const a =
      Math.sin(dp / 2) ** 2 +
      Math.cos(p1) *
      Math.cos(p2) *
      Math.sin(dl / 2) ** 2;

    return 2 * R *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );
  };

  U.dayOfYear = date => {
    const d = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      )
    );

    const y0 = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        0,
        0
      )
    );

    return Math.floor(
      (d - y0) / 86400000
    );
  };

  U.solarDeclinationRad = date => {
    const n = U.dayOfYear(date);

    return U.degToRad(23.44) *
      Math.sin(
        (2 * Math.PI / 365.2422) *
        (n - 80)
      );
  };

  U.solarCosZenith = (
    lat,
    lon,
    date
  ) => {
    const phi = U.degToRad(lat);
    const dec = U.solarDeclinationRad(date);

    const utcHours =
      date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600;

    const solarHour =
      utcHours +
      lon / 15;

    const H = U.degToRad(
      15 * (solarHour - 12)
    );

    return Math.max(
      0,
      Math.sin(phi) *
      Math.sin(dec) +
      Math.cos(phi) *
      Math.cos(dec) *
      Math.cos(H)
    );
  };

  U.lonToX = (
    lon,
    width,
    bounds = EuropaConfig.bounds
  ) =>
    (lon - bounds.west) /
    (bounds.east - bounds.west) *
    (width - 1);

  U.latToY = (
    lat,
    height,
    bounds = EuropaConfig.bounds
  ) =>
    (bounds.north - lat) /
    (bounds.north - bounds.south) *
    (height - 1);

  U.xToLon = (
    x,
    width,
    bounds = EuropaConfig.bounds
  ) =>
    bounds.west +
    x / (width - 1) *
    (bounds.east - bounds.west);

  U.yToLat = (
    y,
    height,
    bounds = EuropaConfig.bounds
  ) =>
    bounds.north -
    y / (height - 1) *
    (bounds.north - bounds.south);

  U.index = (
    x,
    y,
    nx
  ) =>
    y * nx + x;

  U.bilerpArray = (
    arr,
    x,
    y,
    nx,
    ny
  ) => {
    x = U.clamp(
      x,
      0,
      nx - 1.001
    );

    y = U.clamp(
      y,
      0,
      ny - 1.001
    );

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);

    const x1 = Math.min(
      nx - 1,
      x0 + 1
    );

    const y1 = Math.min(
      ny - 1,
      y0 + 1
    );

    const tx = x - x0;
    const ty = y - y0;

    const a = U.lerp(
      arr[y0 * nx + x0],
      arr[y0 * nx + x1],
      tx
    );

    const b = U.lerp(
      arr[y1 * nx + x0],
      arr[y1 * nx + x1],
      tx
    );

    return U.lerp(
      a,
      b,
      ty
    );
  };

  U.gaussian2D = (
    lat,
    lon,
    cLat,
    cLon,
    sigmaLat,
    sigmaLon
  ) => {
    const a =
      (lat - cLat) /
      sigmaLat;

    const b =
      (lon - cLon) /
      sigmaLon;

    return Math.exp(
      -0.5 *
      (a * a + b * b)
    );
  };

  U.hashNoise = (
    x,
    y,
    seed = 0
  ) => {
    const s =
      Math.sin(
        x * 12.9898 +
        y * 78.233 +
        seed * 37.719
      ) *
      43758.5453;

    return (
      s -
      Math.floor(s)
    ) *
    2 -
    1;
  };

  U.lowFrequencyNoise = (
    x,
    y,
    seed = 0
  ) => {
    const sx = x * 0.12;
    const sy = y * 0.12;

    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);

    const tx = U.smoothstep(
      0,
      1,
      sx - x0
    );

    const ty = U.smoothstep(
      0,
      1,
      sy - y0
    );

    const n00 =
      U.hashNoise(
        x0,
        y0,
        seed
      );

    const n10 =
      U.hashNoise(
        x0 + 1,
        y0,
        seed
      );

    const n01 =
      U.hashNoise(
        x0,
        y0 + 1,
        seed
      );

    const n11 =
      U.hashNoise(
        x0 + 1,
        y0 + 1,
        seed
      );

    return U.lerp(
      U.lerp(
        n00,
        n10,
        tx
      ),
      U.lerp(
        n01,
        n11,
        tx
      ),
      ty
    );
  };

  U.saturationVaporPressureHpa =
    tC =>
      6.112 *
      Math.exp(
        (17.67 * tC) /
        (tC + 243.5)
      );

  U.saturationSpecificHumidity = (
    tC,
    pressureHpa
  ) => {
    const e = Math.min(
      pressureHpa * 0.95,
      U.saturationVaporPressureHpa(tC)
    );

    return (
      0.622 * e /
      Math.max(
        1,
        pressureHpa -
        0.378 * e
      )
    );
  };

  U.relativeHumidityFromQ = (
    q,
    tC,
    pressureHpa
  ) =>
    U.clamp(
      q /
      Math.max(
        1e-6,
        U.saturationSpecificHumidity(
          tC,
          pressureHpa
        )
      ) *
      100,
      0,
      100
    );

  U.dewPointC = (
    tC,
    rh
  ) => {
    rh = U.clamp(
      rh,
      1,
      100
    );

    const a = 17.625;
    const b = 243.04;

    const g =
      Math.log(
        rh / 100
      ) +
      (a * tC) /
      (b + tC);

    return (
      b * g /
      (a - g)
    );
  };

  U.formatUtcMinute = date =>
    date
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ') +
    ' UTC';

  U.toDatetimeLocalValue = date =>
    date
      .toISOString()
      .slice(0, 16);

  U.fromDatetimeLocalAsUtc = value => {
    if (!value) {
      return new Date(NaN);
    }

    return new Date(
      value.endsWith('Z')
        ? value
        : value + ':00Z'
    );
  };

  U.nextAnimationFrame =
    () =>
      new Promise(
        resolve =>
          requestAnimationFrame(resolve)
      );

  window.EuropaUtils =
    Object.freeze(U);
})();
