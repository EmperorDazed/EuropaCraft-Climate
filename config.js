(() => {
  'use strict';

  window.EuropaConfig = Object.freeze({
    version: '8.0.0',

    bounds: Object.freeze({
      west: -26,
      east: 52,
      south: 30,
      north: 74
    }),

    display: Object.freeze({
      width: 780,
      height: 440
    }),

    grid: Object.freeze({
      nx: 195,
      ny: 110
    }),

    physicsStepMinutes: 4,

    layers: Object.freeze([
      { name: 'surface', pressureHpa: 1000, heightM: 20 },
      { name: '925', pressureHpa: 925, heightM: 750 },
      { name: '850', pressureHpa: 850, heightM: 1450 },
      { name: '700', pressureHpa: 700, heightM: 3000 },
      { name: '500', pressureHpa: 500, heightM: 5600 },
      { name: 'upper', pressureHpa: 300, heightM: 9200 }
    ]),

    time: Object.freeze({
      defaultStart: '2026-10-10T00:00:00Z',
      defaultRangeDays: 7,
      snapshotMinutes: 60,
      stationSampleMinutes: 4,
      maxInMemorySnapshots: 48
    }),

    geography: Object.freeze({
      landUrls: Object.freeze([
        'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_land.geojson',
        'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_land.geojson'
      ]),

      lakesUrls: Object.freeze([
        'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_lakes.geojson',
        'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_lakes.geojson'
      ]),

      maxAltitudeM: 4200
    }),

    physics: Object.freeze({
      minPressureHpa: 930,
      maxPressureHpa: 1070,

      pressureDiffusion: 0.012,
      scalarDiffusion: 0.0025,

      windRelaxation: 0.22,
      windDragLand: 0.018,
      windDragSea: 0.008,

      maxWindMs: 111,

      maxTemperatureC: 65,
      minTemperatureC: -70,

      maxSpecificHumidity: 0.04,

      verticalMixing: 0.025,

      cloudAutoconversion: 0.16,
      cloudEvaporation: 0.06,
      precipEfficiency: 0.78,

      groundThermalInertia: 0.018,
      groundMoistureRecovery: 0.0005,

      snowMeltFactor: 0.045,
      snowSolarMeltFactor: 0.00011,

      snowAlbedo: 0.76,
      landAlbedo: 0.20,
      seaAlbedo: 0.07
    }),

    ocean: Object.freeze({
      heatExchange: 0.015,
      evaporation: 0.010,
      windBoost: 0.055,

      seasonalRelaxation: 0.0012,
      mixedLayerInertia: 0.020,

      minSstC: -2.0,
      maxSstC: 31,

      freezeThresholdC: -1.7,
      meltThresholdC: -0.8
    }),

    precipitation: Object.freeze({
      snowMaxC: 1.5,
      sleetMaxC: 3.0,
      freezingRainWarmNoseC: 1.0
    }),

    forcing: Object.freeze({
      maxSteeringPaths: 16,

      defaultWidthKm: 500,
      defaultSpeedKmh: 40,
      defaultStrength: 0.70,

      maxSpeedKmh: 180,

      maxPressureSystems: 12
    }),

    renderer: Object.freeze({
      isobarIntervalHpa: 4,
      contourRefreshMs: 900,
      fieldRefreshMs: 80,

      particleCount: 1400,
      particleTrail: 0.91
    }),

    safety: Object.freeze({
      longSeekWarningDays: 7,
      maxPhysicsStepsPerAnimationFrame: 5,
      maxSeekStepsPerYield: 150
    })
  });
})();
