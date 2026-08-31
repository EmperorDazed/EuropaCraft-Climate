(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  async function fetchFirst(urls) {
    let lastError = null;

    for (const url of urls) {
      try {
        const response =
          await fetch(
            url,
            {
              cache: 'force-cache'
            }
          );

        if (!response.ok) {
          throw new Error(
            `${response.status} ${response.statusText}`
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      'Unable to load real geography data: ' +
      (
        lastError?.message ||
        'unknown error'
      )
    );
  }

  function traceRing(
    ctx,
    ring,
    width,
    height
  ) {
    if (
      !ring ||
      ring.length < 2
    ) {
      return;
    }

    const first = ring[0];

    ctx.moveTo(
      U.lonToX(
        first[0],
        width
      ),
      U.latToY(
        first[1],
        height
      )
    );

    for (
      let i = 1;
      i < ring.length;
      i++
    ) {
      const point = ring[i];

      ctx.lineTo(
        U.lonToX(
          point[0],
          width
        ),
        U.latToY(
          point[1],
          height
        )
      );
    }

    ctx.closePath();
  }

  function traceGeometry(
    ctx,
    geometry,
    width,
    height
  ) {
    if (!geometry) {
      return;
    }

    if (
      geometry.type ===
      'Polygon'
    ) {
      for (
        const ring
        of geometry.coordinates
      ) {
        traceRing(
          ctx,
          ring,
          width,
          height
        );
      }

      return;
    }

    if (
      geometry.type ===
      'MultiPolygon'
    ) {
      for (
        const polygon
        of geometry.coordinates
      ) {
        for (
          const ring
          of polygon
        ) {
          traceRing(
            ctx,
            ring,
            width,
            height
          );
        }
      }
    }
  }

  function rasterMask(
    land,
    lakes,
    width,
    height
  ) {
    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext(
        '2d',
        {
          willReadFrequently: true
        }
      );

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    ctx.fillStyle = '#ffffff';

    ctx.beginPath();

    for (
      const feature
      of land.features || []
    ) {
      traceGeometry(
        ctx,
        feature.geometry,
        width,
        height
      );
    }

    ctx.fill('evenodd');

    if (
      lakes?.features?.length
    ) {
      ctx.globalCompositeOperation =
        'destination-out';

      ctx.beginPath();

      for (
        const feature
        of lakes.features
      ) {
        traceGeometry(
          ctx,
          feature.geometry,
          width,
          height
        );
      }

      ctx.fill('evenodd');

      ctx.globalCompositeOperation =
        'source-over';
    }

    const rgba =
      ctx.getImageData(
        0,
        0,
        width,
        height
      ).data;

    const mask =
      new Uint8Array(
        width * height
      );

    for (
      let i = 0;
      i < mask.length;
      i++
    ) {
      mask[i] =
        rgba[
          i * 4 + 3
        ] > 20
          ? 1
          : 0;
    }

    return mask;
  }

  function coastDistance(
    mask,
    nx,
    ny
  ) {
    const distance =
      new Float32Array(
        nx * ny
      );

    distance.fill(
      1e9
    );

    const queue =
      new Int32Array(
        nx * ny
      );

    let head = 0;
    let tail = 0;

    for (
      let y = 0;
      y < ny;
      y++
    ) {
      for (
        let x = 0;
        x < nx;
        x++
      ) {
        const i =
          y * nx + x;

        const land =
          mask[i];

        let coastal = false;

        if (
          x > 0 &&
          mask[i - 1] !== land
        ) {
          coastal = true;
        }

        if (
          x < nx - 1 &&
          mask[i + 1] !== land
        ) {
          coastal = true;
        }

        if (
          y > 0 &&
          mask[i - nx] !== land
        ) {
          coastal = true;
        }

        if (
          y < ny - 1 &&
          mask[i + nx] !== land
        ) {
          coastal = true;
        }

        if (coastal) {
          distance[i] = 0;

          queue[tail++] = i;
        }
      }
    }

    const directions = [
      -1,
      1,
      -nx,
      nx
    ];

    while (
      head < tail
    ) {
      const i =
        queue[head++];

      const x =
        i % nx;

      const y =
        Math.floor(
          i / nx
        );

      for (
        const direction
        of directions
      ) {
        const j =
          i + direction;

        if (
          direction === -1 &&
          x === 0
        ) {
          continue;
        }

        if (
          direction === 1 &&
          x === nx - 1
        ) {
          continue;
        }

        if (
          direction === -nx &&
          y === 0
        ) {
          continue;
        }

        if (
          direction === nx &&
          y === ny - 1
        ) {
          continue;
        }

        if (
          j < 0 ||
          j >= distance.length
        ) {
          continue;
        }

        const next =
          distance[i] + 1;

        if (
          next <
          distance[j]
        ) {
          distance[j] =
            next;

          queue[tail++] =
            j;
        }
      }
    }

    const latSpacing =
      (
        C.bounds.north -
        C.bounds.south
      ) /
      (ny - 1);

    const lonSpacing =
      (
        C.bounds.east -
        C.bounds.west
      ) /
      (nx - 1);

    for (
      let y = 0;
      y < ny;
      y++
    ) {
      const lat =
        U.yToLat(
          y,
          ny
        );

      const northSouth =
        111.2 *
        latSpacing;

      const eastWest =
        111.2 *
        Math.cos(
          U.degToRad(lat)
        ) *
        lonSpacing;

      const averageSpacing =
        (
          northSouth +
          eastWest
        ) *
        0.5;

      for (
        let x = 0;
        x < nx;
        x++
      ) {
        distance[
          y * nx + x
        ] *=
          averageSpacing;
      }
    }

    return distance;
  }

  const mountainKernels = [
    [
      46.2,
      10.5,
      2.0,
      4.8,
      3100
    ],

    [
      42.7,
      0.5,
      1.2,
      5.2,
      2400
    ],

    [
      47.8,
      24.2,
      2.0,
      5.0,
      2200
    ],

    [
      42.8,
      20.8,
      2.6,
      5.3,
      1900
    ],

    [
      64.0,
      10.0,
      5.5,
      4.5,
      1500
    ],

    [
      42.5,
      43.5,
      2.0,
      5.0,
      3200
    ],

    [
      39.0,
      35.0,
      3.8,
      9.0,
      1800
    ],

    [
      40.2,
      16.0,
      3.0,
      4.0,
      1500
    ],

    [
      37.0,
      -4.5,
      2.0,
      5.0,
      1400
    ],

    [
      54.5,
      -3.0,
      2.5,
      2.0,
      700
    ],

    [
      57.0,
      -4.2,
      2.5,
      2.2,
      850
    ],

    [
      65.0,
      -18.0,
      4.5,
      4.5,
      1200
    ]
  ];

  function buildElevation(
    mask,
    nx,
    ny
  ) {
    const elevationM =
      new Float32Array(
        nx * ny
      );

    const roughness =
      new Float32Array(
        nx * ny
      );

    for (
      let y = 0;
      y < ny;
      y++
    ) {
      const lat =
        U.yToLat(
          y,
          ny
        );

      for (
        let x = 0;
        x < nx;
        x++
      ) {
        const i =
          y * nx + x;

        if (!mask[i]) {
          continue;
        }

        const lon =
          U.xToLon(
            x,
            nx
          );

        let altitude = 35;

        for (
          const kernel
          of mountainKernels
        ) {
          altitude +=
            kernel[4] *
            U.gaussian2D(
              lat,
              lon,
              kernel[0],
              kernel[1],
              kernel[2],
              kernel[3]
            );
        }

        altitude +=
          Math.max(
            0,
            U.lowFrequencyNoise(
              x,
              y,
              8
            )
          ) *
          90;

        altitude =
          U.clamp(
            altitude,
            0,
            C.geography
              .maxAltitudeM
          );

        elevationM[i] =
          altitude;

        roughness[i] =
          U.clamp(
            altitude / 1800 +
            Math.abs(
              U.lowFrequencyNoise(
                x * 1.7,
                y * 1.7,
                13
              )
            ) *
            0.22,
            0,
            1
          );
      }
    }

    return {
      elevationM,
      roughness
    };
  }

  class Geography {
    constructor() {
      this.ready = false;

      this.landGeoJSON =
        null;

      this.lakesGeoJSON =
        null;

      this.landMask =
        null;

      this.displayLandMask =
        null;

      this.elevationM =
        null;

      this.roughness =
        null;

      this.distanceToCoastKm =
        null;
    }

    async init() {
      const results =
        await Promise.all([
          fetchFirst(
            C.geography
              .landUrls
          ),

          fetchFirst(
            C.geography
              .lakesUrls
          ).catch(
            () => ({
              type:
                'FeatureCollection',

              features: []
            })
          )
        ]);

      this.landGeoJSON =
        results[0];

      this.lakesGeoJSON =
        results[1];

      this.landMask =
        rasterMask(
          this.landGeoJSON,
          this.lakesGeoJSON,
          C.grid.nx,
          C.grid.ny
        );

      this.displayLandMask =
        rasterMask(
          this.landGeoJSON,
          this.lakesGeoJSON,
          C.display.width,
          C.display.height
        );

      this.distanceToCoastKm =
        coastDistance(
          this.landMask,
          C.grid.nx,
          C.grid.ny
        );

      const terrain =
        buildElevation(
          this.landMask,
          C.grid.nx,
          C.grid.ny
        );

      this.elevationM =
        terrain.elevationM;

      this.roughness =
        terrain.roughness;

      this.ready = true;

      return this;
    }

    isLandIndex(i) {
      return !!this.landMask[i];
    }

    sampleElevation(
      lat,
      lon
    ) {
      return U.bilerpArray(
        this.elevationM,
        U.lonToX(
          lon,
          C.grid.nx
        ),
        U.latToY(
          lat,
          C.grid.ny
        ),
        C.grid.nx,
        C.grid.ny
      );
    }
  }

  window.EuropaTerrain =
    Object.freeze({
      Geography,
      traceGeometry
    });
})();
