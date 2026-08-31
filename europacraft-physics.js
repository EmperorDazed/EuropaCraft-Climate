(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  class PhysicsEngine {
    constructor(
      geography,
      ocean,
      atmosphere,
      synoptic
    ) {
      this.g =
        geography;

      this.ocean =
        ocean;

      this.a =
        atmosphere;

      this.s =
        synoptic;

      const n =
        C.grid.nx *
        C.grid.ny;

      this.tmpA =
        new Float32Array(n);

      this.tmpB =
        new Float32Array(n);

      this.prevPressure =
        new Float32Array(n);
    }

    _advect(
      source,
      destination,
      u,
      v,
      dtSeconds
    ) {
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

        const kmPerDegLon =
          111.2 *
          Math.max(
            0.18,
            Math.cos(
              U.degToRad(lat)
            )
          );

        const degLonPerMetre =
          1 /
          (
            kmPerDegLon *
            1000
          );

        const degLatPerMetre =
          1 /
          111200;

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

          const sourceLon =
            lon -
            u[i] *
            dtSeconds *
            degLonPerMetre;

          const sourceLat =
            lat -
            v[i] *
            dtSeconds *
            degLatPerMetre;

          const sx =
            U.lonToX(
              sourceLon,
              nx
            );

          const sy =
            U.latToY(
              sourceLat,
              ny
            );

          destination[i] =
            U.bilerpArray(
              source,
              sx,
              sy,
              nx,
              ny
            );
        }
      }
    }

    _diffuse(
      array,
      scratch,
      amount
    ) {
      if (
        amount <= 0
      ) {
        return;
      }

      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      scratch.set(array);

      for (
        let y = 1;
        y < ny - 1;
        y++
      ) {
        for (
          let x = 1;
          x < nx - 1;
          x++
        ) {
          const i =
            y * nx + x;

          const average =
            (
              scratch[i - 1] +
              scratch[i + 1] +
              scratch[i - nx] +
              scratch[i + nx]
            ) /
            4;

          array[i] =
            U.lerp(
              scratch[i],
              average,
              amount
            );
        }
      }
    }

    _pressureStep(
      date,
      dtHours
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const pressure =
        this.a.pressureHpa;

      this.prevPressure
        .set(pressure);

      const steeringLayer =
        this.a.layers[3];

      this._advect(
        this.prevPressure,
        this.tmpA,
        steeringLayer.u,
        steeringLayer.v,
        dtHours * 3600
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

          const lon =
            U.xToLon(
              x,
              nx
            );

          const background =
            1014 +
            3 *
            Math.cos(
              U.degToRad(
                lat * 2.6
              )
            ) +
            2 *
            Math.sin(
              U.degToRad(
                lon * 2.2
              )
            );

          let value =
            this.tmpA[i];

          value +=
            (
              background -
              value
            ) *
            0.0018 *
            dtHours;

          value +=
            this.s
              .pressureTendencyAt(
                lat,
                lon,
                date,
                value,
                dtHours
              );

          pressure[i] =
            U.clamp(
              value,
              C.physics
                .minPressureHpa,
              C.physics
                .maxPressureHpa
            );
        }
      }

      this._diffuse(
        pressure,
        this.tmpB,
        C.physics
          .pressureDiffusion
      );
    }

    _windStep(
      date,
      dtHours
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const pressure =
        this.a.pressureHpa;

      const lonDegrees =
        (
          C.bounds.east -
          C.bounds.west
        ) /
        (nx - 1);

      const latDegrees =
        (
          C.bounds.north -
          C.bounds.south
        ) /
        (ny - 1);

      for (
        let k = 0;
        k < this.a.layers.length;
        k++
      ) {
        const layer =
          this.a.layers[k];

        for (
          let y = 1;
          y < ny - 1;
          y++
        ) {
          const lat =
            U.yToLat(
              y,
              ny
            );

          const dxMetres =
            111200 *
            Math.cos(
              U.degToRad(lat)
            ) *
            lonDegrees;

          const dyMetres =
            111200 *
            latDegrees;

          const f =
            Math.max(
              2e-5,
              2 *
              7.2921e-5 *
              Math.sin(
                U.degToRad(lat)
              )
            );

          for (
            let x = 1;
            x < nx - 1;
            x++
          ) {
            const i =
              y * nx + x;

            const dpdx =
              (
                pressure[i + 1] -
                pressure[i - 1]
              ) *
              100 /
              (
                2 *
                dxMetres
              );

            const dpdy =
              (
                pressure[i - nx] -
                pressure[i + nx]
              ) *
              100 /
              (
                2 *
                dyMetres
              );

            const density =
              1.225 *
              Math.exp(
                -C.layers[k]
                  .heightM /
                8500
              );

            let targetU =
              -1 /
              (
                density *
                f
              ) *
              dpdy;

            let targetV =
              1 /
              (
                density *
                f
              ) *
              dpdx;

            const layerBoost =
              0.62 +
              k *
              0.11;

            targetU *=
              layerBoost;

            targetV *=
              layerBoost;

            const steering =
              this.s
                .steeringAt(
                  lat,
                  U.xToLon(
                    x,
                    nx
                  ),
                  date,
                  k
                );

            targetU =
              U.lerp(
                targetU,
                steering.u,
                steering.weight
              );

            targetV =
              U.lerp(
                targetV,
                steering.v,
                steering.weight
              );

            const land =
              this.g
                .landMask[i];

            const drag =
              (
                land
                  ?
                    C.physics
                      .windDragLand
                  :
                    C.physics
                      .windDragSea
              ) *
              (
                k === 0
                  ?
                    1
                  :
                    0.35
              );

            const relaxation =
              U.clamp(
                C.physics
                  .windRelaxation *
                dtHours *
                4,
                0,
                1
              );

            layer.u[i] =
              U.clamp(
                U.lerp(
                  layer.u[i],
                  targetU,
                  relaxation
                ) *
                (
                  1 -
                  drag
                ),
                -C.physics
                  .maxWindMs,
                C.physics
                  .maxWindMs
              );

            layer.v[i] =
              U.clamp(
                U.lerp(
                  layer.v[i],
                  targetV,
                  relaxation
                ) *
                (
                  1 -
                  drag
                ),
                -C.physics
                  .maxWindMs,
                C.physics
                  .maxWindMs
              );
          }
        }
      }
    }

    _advectScalars(
      dtSeconds
    ) {
      for (
        let k = 0;
        k < this.a.layers.length;
        k++
      ) {
        const layer =
          this.a.layers[k];

        this._advect(
          layer.tempC,
          this.tmpA,
          layer.u,
          layer.v,
          dtSeconds
        );

        layer.tempC
          .set(
            this.tmpA
          );

        this._advect(
          layer.q,
          this.tmpA,
          layer.u,
          layer.v,
          dtSeconds
        );

        layer.q
          .set(
            this.tmpA
          );

        this._advect(
          layer.cloud,
          this.tmpA,
          layer.u,
          layer.v,
          dtSeconds
        );

        layer.cloud
          .set(
            this.tmpA
          );

        this._diffuse(
          layer.tempC,
          this.tmpB,
          C.physics
            .scalarDiffusion
        );

        this._diffuse(
          layer.q,
          this.tmpB,
          C.physics
            .scalarDiffusion
        );
      }
    }

    _verticalAndCloudStep(
      dtHours
    ) {
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

          for (
            let k = 0;
            k < this.a.layers.length;
            k++
          ) {
            const layer =
              this.a.layers[k];

            const pressure =
              C.layers[k]
                .pressureHpa;

            if (
              k <
              this.a.layers
                .length -
              1
            ) {
              const upper =
                this.a.layers[
                  k + 1
                ];

              const mix =
                C.physics
                  .verticalMixing *
                dtHours;

              const tempA =
                layer.tempC[i];

              const tempB =
                upper.tempC[i];

              layer.tempC[i] +=
                (
                  tempB -
                  tempA
                ) *
                mix *
                0.15;

              upper.tempC[i] +=
                (
                  tempA -
                  tempB
                ) *
                mix *
                0.08;

              const qA =
                layer.q[i];

              const qB =
                upper.q[i];

              layer.q[i] +=
                (
                  qB -
                  qA
                ) *
                mix *
                0.12;

              upper.q[i] +=
                (
                  qA -
                  qB
                ) *
                mix *
                0.08;
            }

            const saturation =
              U.saturationSpecificHumidity(
                layer.tempC[i],
                pressure
              );

            if (
              layer.q[i] >
              saturation
            ) {
              const excess =
                layer.q[i] -
                saturation;

              layer.q[i] =
                saturation;

              layer.cloud[i] =
                U.clamp(
                  layer.cloud[i] +
                  excess *
                  85,
                  0,
                  1.5
                );

              layer.tempC[i] +=
                excess *
                180;
            } else {
              const deficit =
                saturation -
                layer.q[i];

              const evaporation =
                Math.min(
                  layer.cloud[i],
                  deficit *
                  20 *
                  C.physics
                    .cloudEvaporation *
                  dtHours
                );

              layer.cloud[i] =
                Math.max(
                  0,
                  layer.cloud[i] -
                  evaporation
                );
            }
          }

          if (
            x > 0 &&
            x < nx - 1 &&
            y > 0 &&
            y < ny - 1
          ) {
            const t =
              this.a.surface
                .tempC;

            const gradient =
              Math.hypot(
                t[i + 1] -
                t[i - 1],

                t[i - nx] -
                t[i + nx]
              );

            this.a
              .frontStrength[i] =
              U.clamp(
                gradient /
                8,
                0,
                1
              );
          }
        }
      }
    }

    _surfaceStep(
      date,
      dtHours
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const surface =
        this.a.surface;

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

          const land =
            this.g
              .landMask[i];

          const wind =
            Math.hypot(
              surface.u[i],
              surface.v[i]
            );

          const cloud =
            U.clamp(
              (
                surface.cloud[i] +
                this.a.layers[1]
                  .cloud[i]
              ) /
              2,
              0,
              1
            );

          const solar =
            1361 *
            U.solarCosZenith(
              lat,
              lon,
              date
            ) *
            (
              1 -
              0.72 *
              cloud
            );

          if (land) {
            const snow =
              U.clamp(
                this.a
                  .snowDepthCm[i] /
                8,
                0,
                1
              );

            const albedo =
              U.lerp(
                C.physics
                  .landAlbedo,
                C.physics
                  .snowAlbedo,
                snow
              );

            const netSolar =
              solar *
              (
                1 -
                albedo
              );

            const climatology =
              EuropaClimate
                .hourlyClimatology(
                  lat,
                  lon,
                  date,
                  this.g,
                  this.g
                    .elevationM[i],
                  this.a
                    .groundMoisture[i],
                  cloud
                );

            const ground =
              this.a
                .groundTempC[i];

            const exchange =
              (
                0.020 +
                0.003 *
                wind
              ) *
              dtHours;

            surface.tempC[i] +=
              (
                ground -
                surface.tempC[i]
              ) *
              exchange;

            surface.tempC[i] +=
              (
                climatology -
                surface.tempC[i]
              ) *
              0.010 *
              dtHours;

            this.a
              .groundTempC[i] +=
              (
                surface.tempC[i] -
                ground
              ) *
              C.physics
                .groundThermalInertia *
              dtHours;

            this.a
              .groundTempC[i] +=
              netSolar *
              0.00020 *
              dtHours;

            const qsat =
              U.saturationSpecificHumidity(
                surface.tempC[i],
                1000
              );

            const deficit =
              Math.max(
                0,
                qsat -
                surface.q[i]
              );

            const evaporation =
              Math.min(
                this.a
                  .groundMoisture[i],

                deficit *
                (
                  0.02 +
                  wind *
                  0.002
                ) *
                dtHours
              );

            surface.q[i] +=
              evaporation *
              0.08;

            this.a
              .groundMoisture[i] =
              U.clamp(
                this.a
                  .groundMoisture[i] -
                evaporation +
                C.physics
                  .groundMoistureRecovery *
                dtHours,
                0,
                1
              );
          } else {
            const sst =
              this.ocean
                .sstC[i];

            const ice =
              this.ocean
                .seaIce[i];

            if (
              Number.isFinite(sst)
            ) {
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
                ) *
                dtHours;

              surface.tempC[i] +=
                (
                  sst -
                  surface.tempC[i]
                ) *
                exchange;

              const seaSaturation =
                U.saturationSpecificHumidity(
                  sst,
                  1000
                );

              const deficit =
                Math.max(
                  0,
                  seaSaturation -
                  surface.q[i]
                );

              surface.q[i] +=
                deficit *
                C.ocean
                  .evaporation *
                (
                  1 +
                  0.08 *
                  wind
                ) *
                (
                  1 -
                  0.95 *
                  ice
                ) *
                dtHours;
            }
          }

          surface.tempC[i] =
            U.clamp(
              surface.tempC[i],
              C.physics
                .minTemperatureC,
              C.physics
                .maxTemperatureC
            );

          surface.q[i] =
            U.clamp(
              surface.q[i],
              0,
              C.physics
                .maxSpecificHumidity
            );
        }
      }
    }

    _divergenceAt(
      x,
      y
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      if (
        x <= 0 ||
        x >= nx - 1 ||
        y <= 0 ||
        y >= ny - 1
      ) {
        return 0;
      }

      const i =
        y * nx + x;

      const surface =
        this.a.surface;

      return (
        surface.u[i + 1] -
        surface.u[i - 1]
      ) +
      (
        surface.v[i - nx] -
        surface.v[i + nx]
      );
    }

    _orographicLiftAt(
      x,
      y
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      if (
        x <= 0 ||
        x >= nx - 1 ||
        y <= 0 ||
        y >= ny - 1
      ) {
        return 0;
      }

      const i =
        y * nx + x;

      const elevation =
        this.g
          .elevationM;

      const dzdx =
        (
          elevation[i + 1] -
          elevation[i - 1]
        ) /
        2;

      const dzdy =
        (
          elevation[i - nx] -
          elevation[i + nx]
        ) /
        2;

      const surface =
        this.a.surface;

      const wind =
        Math.hypot(
          surface.u[i],
          surface.v[i]
        ) ||
        1;

      return Math.max(
        0,

        (
          surface.u[i] /
          wind
        ) *
        dzdx /
        1000 +

        (
          surface.v[i] /
          wind
        ) *
        dzdy /
        1000
      );
    }

    _precipAndSnow(
      date,
      dtHours
    ) {
      const nx =
        C.grid.nx;

      const ny =
        C.grid.ny;

      const surface =
        this.a.surface;

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

          let cloudWater = 0;

          for (
            const layer
            of this.a.layers
          ) {
            cloudWater +=
              layer.cloud[i];
          }

          cloudWater /=
            this.a.layers.length;

          const convergence =
            Math.max(
              0,
              -this._divergenceAt(
                x,
                y
              )
            );

          const frontal =
            this.a
              .frontStrength[i];

          const orographic =
            this.g.landMask[i]
              ?
                this._orographicLiftAt(
                  x,
                  y
                )
              :
                0;

          const lift =
            U.clamp(
              convergence *
              0.09 +
              frontal *
              0.55 +
              orographic *
              0.45,
              0,
              1.5
            );

          let rate =
            Math.max(
              0,
              cloudWater -
              0.18
            ) *
            C.physics
              .precipEfficiency *
            (
              0.7 +
              lift *
              4.0
            );

          rate =
            U.clamp(
              rate *
              7.5,
              0,
              45
            );

          this.a
            .precipRateMmHr[i] =
            rate;

          let type = 0;

          if (
            rate > 0.03
          ) {
            const surfaceTemp =
              surface.tempC[i];

            const temp850 =
              this.a.layers[2]
                .tempC[i];

            if (
              surfaceTemp <=
              C.precipitation
                .snowMaxC &&
              temp850 <=
              1.5
            ) {
              type = 3;
            } else if (
              surfaceTemp <=
              0.5 &&
              temp850 >
              C.precipitation
                .freezingRainWarmNoseC
            ) {
              type = 4;
            } else if (
              surfaceTemp <=
              C.precipitation
                .sleetMaxC
            ) {
              type = 2;
            } else {
              type = 1;
            }
          }

          this.a
            .precipType[i] =
            type;

          const mm =
            rate *
            dtHours;

          this.a
            .accumulatedPrecipMm[i] +=
            mm;

          if (
            type === 3
          ) {
            const ratio =
              U.clamp(
                10 +
                (
                  0 -
                  surface.tempC[i]
                ) *
                1.4,
                7,
                18
              );

            const snowCm =
              mm *
              ratio /
              10;

            const groundFactor =
              U.clamp(
                (
                  2.5 -
                  this.a
                    .groundTempC[i]
                ) /
                4,
                0,
                1
              );

            const accumulation =
              snowCm *
              groundFactor;

            this.a
              .snowDepthCm[i] +=
              accumulation;

            this.a
              .accumulatedSnowCm[i] +=
              accumulation;
          }

          if (
            this.g
              .landMask[i]
          ) {
            this.a
              .groundMoisture[i] =
              U.clamp(
                this.a
                  .groundMoisture[i] +
                mm *
                0.008,
                0,
                1
              );

            const solar =
              1361 *
              U.solarCosZenith(
                U.yToLat(
                  y,
                  ny
                ),
                U.xToLon(
                  x,
                  nx
                ),
                date
              );

            const warmth =
              Math.max(
                0,
                surface.tempC[i]
              ) +
              Math.max(
                0,
                this.a
                  .groundTempC[i]
              ) *
              0.5;

            const melt =
              (
                warmth *
                C.physics
                  .snowMeltFactor +

                solar *
                C.physics
                  .snowSolarMeltFactor
              ) *
              dtHours;

            this.a
              .snowDepthCm[i] =
              Math.max(
                0,
                this.a
                  .snowDepthCm[i] -
                melt
              );
          } else {
            this.a
              .snowDepthCm[i] =
              0;
          }
        }
      }
    }

    step(
      date,
      dtMinutes =
        C.physicsStepMinutes
    ) {
      const dtHours =
        dtMinutes / 60;

      const dtSeconds =
        dtMinutes * 60;

      this._pressureStep(
        date,
        dtHours
      );

      this._windStep(
        date,
        dtHours
      );

      this._advectScalars(
        dtSeconds
      );

      this._verticalAndCloudStep(
        dtHours
      );

      this._surfaceStep(
        date,
        dtHours
      );

      this._precipAndSnow(
        date,
        dtHours
      );

      this.ocean.step(
        this.a,
        date,
        dtHours
      );

      this.s.advance(
        date,
        dtHours
      );
    }
  }

  window.EuropaPhysics =
    Object.freeze({
      PhysicsEngine
    });
})();
