(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  class OceanModel {
    constructor(
      geography
    ) {
      const n =
        C.grid.nx *
        C.grid.ny;

      this.geography =
        geography;

      this.sstC =
        new Float32Array(n);

      this.seaIce =
        new Float32Array(n);
    }

    climatologicalSst(
      lat,
      lon,
      date
    ) {
      const day =
        U.dayOfYear(date);

      const seasonal =
        Math.cos(
          2 *
          Math.PI *
          (
            day -
            225
          ) /
          365.2422
        );

      let mean =
        16.5 -
        0.42 *
        (
          lat -
          40
        );

      if (lon < -8) {
        mean += 1.3;
      }

      if (lat > 58) {
        mean -= 1.5;
      }

      if (
        lat < 45 &&
        lon > 0 &&
        lon < 38
      ) {
        mean += 2.0;
      }

      if (
        lon > 20 &&
        lat > 50
      ) {
        mean -= 1.2;
      }

      const amplitude =
        3.0 +
        Math.max(
          0,
          lat - 45
        ) *
        0.05;

      return U.clamp(
        mean +
        amplitude *
        seasonal,
        C.ocean.minSstC,
        C.ocean.maxSstC
      );
    }

    init(date) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

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

          if (
            this.geography
              .landMask[i]
          ) {
            this.sstC[i] =
              NaN;

            this.seaIce[i] =
              0;

            continue;
          }

          const lat =
            U.yToLat(
              y,
              ny
            );

          const lon =
            U.xToLon(
              x,
              nx
            );

          this.sstC[i] =
            this.climatologicalSst(
              lat,
              lon,
              date
            );

          this.seaIce[i] =
            this.sstC[i] <=
            C.ocean
              .freezeThresholdC
              ?
                0.35
              :
                0;
        }
      }
    }

    step(
      atmosphere,
      date,
      dtHours
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const surface =
        atmosphere.surface;

      for (
        let i = 0;
        i < nx * ny;
        i++
      ) {
        if (
          this.geography
            .landMask[i]
        ) {
          continue;
        }

        const x =
          i % nx;

        const y =
          Math.floor(
            i / nx
          );

        const lat =
          U.yToLat(
            y,
            ny
          );

        const lon =
          U.xToLon(
            x,
            nx
          );

        const clim =
          this.climatologicalSst(
            lat,
            lon,
            date
          );

        const wind =
          Math.hypot(
            surface.u[i],
            surface.v[i]
          );

        const ice =
          this.seaIce[i];

        const exchange =
          C.ocean
            .heatExchange *
          (
            1 +
            C.ocean
              .windBoost *
            wind
          ) *
          (
            1 -
            0.92 *
            ice
          );

        this.sstC[i] +=
          (
            surface.tempC[i] -
            this.sstC[i]
          ) *
          exchange *
          dtHours *
          C.ocean
            .mixedLayerInertia;

        this.sstC[i] +=
          (
            clim -
            this.sstC[i]
          ) *
          C.ocean
            .seasonalRelaxation *
          dtHours;

        this.sstC[i] =
          U.clamp(
            this.sstC[i],
            C.ocean.minSstC,
            C.ocean.maxSstC
          );

        if (
          this.sstC[i] <=
          C.ocean
            .freezeThresholdC
        ) {
          this.seaIce[i] =
            U.clamp(
              ice +
              0.010 *
              dtHours,
              0,
              1
            );
        } else if (
          this.sstC[i] >=
          C.ocean
            .meltThresholdC
        ) {
          this.seaIce[i] =
            U.clamp(
              ice -
              0.020 *
              dtHours,
              0,
              1
            );
        }
      }
    }

    sample(
      lat,
      lon
    ) {
      const x =
        U.lonToX(
          lon,
          C.grid.nx
        );

      const y =
        U.latToY(
          lat,
          C.grid.ny
        );

      return {
        sstC:
          U.bilerpArray(
            this.sstC,
            x,
            y,
            C.grid.nx,
            C.grid.ny
          ),

        seaIce:
          U.bilerpArray(
            this.seaIce,
            x,
            y,
            C.grid.nx,
            C.grid.ny
          )
      };
    }
  }

  window.EuropaOcean =
    Object.freeze({
      OceanModel
    });
})();
