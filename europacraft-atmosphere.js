(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  class LayerState {
    constructor(n) {
      this.tempC =
        new Float32Array(n);

      this.q =
        new Float32Array(n);

      this.u =
        new Float32Array(n);

      this.v =
        new Float32Array(n);

      this.cloud =
        new Float32Array(n);
    }

    clone() {
      const result =
        Object.create(
          LayerState.prototype
        );

      result.tempC =
        new Float32Array(
          this.tempC
        );

      result.q =
        new Float32Array(
          this.q
        );

      result.u =
        new Float32Array(
          this.u
        );

      result.v =
        new Float32Array(
          this.v
        );

      result.cloud =
        new Float32Array(
          this.cloud
        );

      return result;
    }
  }

  class AtmosphereState {
    constructor(
      geography,
      ocean
    ) {
      this.geography =
        geography;

      this.ocean =
        ocean;

      const n =
        C.grid.nx *
        C.grid.ny;

      this.layers =
        C.layers.map(
          () =>
            new LayerState(n)
        );

      this.surface =
        this.layers[0];

      this.pressureHpa =
        new Float32Array(n);

      this.precipRateMmHr =
        new Float32Array(n);

      this.precipType =
        new Uint8Array(n);

      this.snowDepthCm =
        new Float32Array(n);

      this.groundTempC =
        new Float32Array(n);

      this.groundMoisture =
        new Float32Array(n);

      this.frontStrength =
        new Float32Array(n);

      this.accumulatedPrecipMm =
        new Float32Array(n);

      this.accumulatedSnowCm =
        new Float32Array(n);
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

          const lon =
            U.xToLon(
              x,
              nx
            );

          const elevation =
            this.geography
              .elevationM[i];

          const base =
            EuropaClimate
              .hourlyClimatology(
                lat,
                lon,
                date,
                this.geography,
                elevation,
                0.5,
                0.25
              );

          const wave =
            2.0 *
            Math.sin(
              U.degToRad(
                lon * 2.2 +
                lat * 0.8
              )
            ) +
            1.2 *
            Math.cos(
              U.degToRad(
                lon * 3 -
                lat
              )
            );

          this.pressureHpa[i] =
            1016 +
            7 *
            Math.sin(
              U.degToRad(
                lon * 2 +
                lat * 1.3
              )
            ) +
            4 *
            Math.cos(
              U.degToRad(
                lon * 3.4 -
                lat * 0.6
              )
            );

          this.groundTempC[i] =
            base - 0.5;

          this.groundMoisture[i] =
            this.geography
              .landMask[i]
              ?
                0.55
              :
                0;

          for (
            let k = 0;
            k < this.layers.length;
            k++
          ) {
            const layer =
              this.layers[k];

            const height =
              C.layers[k]
                .heightM;

            const lapse =
              0.0061 *
              height;

            layer.tempC[i] =
              base -
              lapse +
              wave *
              (
                1 -
                k *
                0.08
              );

            const pressure =
              C.layers[k]
                .pressureHpa;

            const rh =
              U.clamp(
                72 -
                k * 7 +
                12 *
                Math.sin(
                  U.degToRad(
                    lon * 1.7 -
                    lat * 2.1
                  )
                ),
                25,
                95
              );

            layer.q[i] =
              U.saturationSpecificHumidity(
                layer.tempC[i],
                pressure
              ) *
              (
                rh / 100
              );

            const jet =
              Math.max(
                0,
                (
                  lat -
                  38
                ) /
                28
              ) *
              (
                3 +
                k * 4
              );

            layer.u[i] =
              4 +
              jet +
              2 *
              Math.sin(
                U.degToRad(
                  lon * 2 +
                  lat
                )
              );

            layer.v[i] =
              2 *
              Math.sin(
                U.degToRad(
                  lon * 1.5 -
                  lat * 1.2
                )
              );

            layer.cloud[i] =
              U.clamp(
                (
                  rh -
                  70
                ) /
                28,
                0,
                0.7
              );
          }
        }
      }

      this.precipRateMmHr
        .fill(0);

      this.precipType
        .fill(0);

      this.snowDepthCm
        .fill(0);

      this.accumulatedPrecipMm
        .fill(0);

      this.accumulatedSnowCm
        .fill(0);

      return this;
    }

    cloneEssential() {
      return {
        pressureHpa:
          new Float32Array(
            this.pressureHpa
          ),

        precipRateMmHr:
          new Float32Array(
            this.precipRateMmHr
          ),

        precipType:
          new Uint8Array(
            this.precipType
          ),

        snowDepthCm:
          new Float32Array(
            this.snowDepthCm
          ),

        groundTempC:
          new Float32Array(
            this.groundTempC
          ),

        groundMoisture:
          new Float32Array(
            this.groundMoisture
          ),

        accumulatedPrecipMm:
          new Float32Array(
            this.accumulatedPrecipMm
          ),

        accumulatedSnowCm:
          new Float32Array(
            this.accumulatedSnowCm
          ),

        layers:
          this.layers.map(
            layer =>
              layer.clone()
          )
      };
    }

    restore(snapshot) {
      this.pressureHpa
        .set(
          snapshot
            .pressureHpa
        );

      this.precipRateMmHr
        .set(
          snapshot
            .precipRateMmHr
        );

      this.precipType
        .set(
          snapshot
            .precipType
        );

      this.snowDepthCm
        .set(
          snapshot
            .snowDepthCm
        );

      this.groundTempC
        .set(
          snapshot
            .groundTempC
        );

      this.groundMoisture
        .set(
          snapshot
            .groundMoisture
        );

      this.accumulatedPrecipMm
        .set(
          snapshot
            .accumulatedPrecipMm
        );

      this.accumulatedSnowCm
        .set(
          snapshot
            .accumulatedSnowCm
        );

      for (
        let k = 0;
        k < this.layers.length;
        k++
      ) {
        const destination =
          this.layers[k];

        const source =
          snapshot.layers[k];

        destination.tempC
          .set(
            source.tempC
          );

        destination.q
          .set(
            source.q
          );

        destination.u
          .set(
            source.u
          );

        destination.v
          .set(
            source.v
          );

        destination.cloud
          .set(
            source.cloud
          );
      }
    }
  }

  window.EuropaAtmosphere =
    Object.freeze({
      AtmosphereState,
      LayerState
    });
})();
