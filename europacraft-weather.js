(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  class WeatherWorld
    extends EventTarget {

    constructor(
      options = {}
    ) {
      super();

      this.simTime =
        new Date(
          options.startTime ||
          C.time.defaultStart
        );

      this.prevTime =
        new Date(
          this.simTime
        );

      this.rangeStart =
        new Date(
          this.simTime
        );

      this.rangeEnd =
        new Date(
          this.simTime.getTime() +
          C.time
            .defaultRangeDays *
          86400000
        );

      this.playing =
        false;

      this.speed =
        600;

      this.visualFraction =
        0;

      this.accumulatorSimSeconds =
        0;

      this.lastFrame =
        performance.now();

      this.lastParticleFrame =
        this.lastFrame;

      this.stations =
        [];

      this.mode =
        'inspect';

      this.ready =
        false;
    }

    async init(
      canvases
    ) {
      this.geography =
        await new EuropaTerrain
          .Geography()
          .init();

      this.ocean =
        new EuropaOcean
          .OceanModel(
            this.geography
          );

      this.ocean.init(
        this.simTime
      );

      this.atmosphere =
        new EuropaAtmosphere
          .AtmosphereState(
            this.geography,
            this.ocean
          );

      this.atmosphere.init(
        this.simTime
      );

      this.synoptic =
        new EuropaSynoptic
          .SynopticController();

      this.physics =
        new EuropaPhysics
          .PhysicsEngine(
            this.geography,
            this.ocean,
            this.atmosphere,
            this.synoptic
          );

      this.history =
        new EuropaHistory
          .HistoryManager(
            this
          );

      this.prevDisplayState =
        this.captureDisplayState();

      this.currDisplayState =
        this.captureDisplayState();

      this.renderer =
        new EuropaRenderer
          .Renderer(
            this,
            canvases.field,
            canvases.overlay,
            canvases.particles
          );

      this.history
        .maybeSnapshot();

      this.ready =
        true;

      requestAnimationFrame(
        time =>
          this._frame(time)
      );

      this.dispatchEvent(
        new Event(
          'ready'
        )
      );

      return this;
    }

    captureDisplayState() {
      const atmosphere =
        this.atmosphere;

      const n =
        C.grid.nx *
        C.grid.ny;

      const rh =
        new Float32Array(n);

      const dewPointC =
        new Float32Array(n);

      const anomalyC =
        new Float32Array(n);

      const cloud =
        new Float32Array(n);

      for (
        let y = 0;
        y < C.grid.ny;
        y++
      ) {
        const lat =
          U.yToLat(
            y,
            C.grid.ny
          );

        for (
          let x = 0;
          x < C.grid.nx;
          x++
        ) {
          const i =
            y *
            C.grid.nx +
            x;

          const lon =
            U.xToLon(
              x,
              C.grid.nx
            );

          rh[i] =
            U.relativeHumidityFromQ(
              atmosphere
                .surface
                .q[i],

              atmosphere
                .surface
                .tempC[i],

              1000
            );

          dewPointC[i] =
            U.dewPointC(
              atmosphere
                .surface
                .tempC[i],

              rh[i]
            );

          cloud[i] =
            U.clamp(
              (
                atmosphere
                  .layers[0]
                  .cloud[i] +

                atmosphere
                  .layers[1]
                  .cloud[i] +

                atmosphere
                  .layers[2]
                  .cloud[i]
              ) /
              3,
              0,
              1
            );

          const climatology =
            EuropaClimate
              .hourlyClimatology(
                lat,
                lon,
                this.simTime,
                this.geography,
                this.geography
                  .elevationM[i],
                atmosphere
                  .groundMoisture[i],
                cloud[i]
              );

          /*
           * HARD REWORK 8 RULE:
           *
           * Actual temperature already exists.
           * Anomaly is calculated afterwards.
           * Anomaly never drives temperature.
           */
          anomalyC[i] =
            atmosphere
              .surface
              .tempC[i] -
            climatology;
        }
      }

      return {
        tempC:
          new Float32Array(
            atmosphere
              .surface
              .tempC
          ),

        u:
          new Float32Array(
            atmosphere
              .surface
              .u
          ),

        v:
          new Float32Array(
            atmosphere
              .surface
              .v
          ),

        pressureHpa:
          new Float32Array(
            atmosphere
              .pressureHpa
          ),

        rh,
        dewPointC,
        cloud,
        anomalyC,

        precipRate:
          new Float32Array(
            atmosphere
              .precipRateMmHr
          ),

        snowDepth:
          new Float32Array(
            atmosphere
              .snowDepthCm
          ),

        groundTemp:
          new Float32Array(
            atmosphere
              .groundTempC
          ),

        front:
          new Float32Array(
            atmosphere
              .frontStrength
          ),

        sstC:
          new Float32Array(
            this.ocean
              .sstC
          ),

        seaIce:
          new Float32Array(
            this.ocean
              .seaIce
          )
      };
    }

    _physicsStep() {
      this.prevTime =
        new Date(
          this.simTime
        );

      this.prevDisplayState =
        this.currDisplayState;

      this.physics.step(
        this.simTime,
        C.physicsStepMinutes
      );

      this.simTime =
        new Date(
          this.simTime.getTime() +
          C.physicsStepMinutes *
          60000
        );

      this.currDisplayState =
        this.captureDisplayState();

      this.history
        .maybeSnapshot();

      this.history
        .sampleStations();

      this.dispatchEvent(
        new CustomEvent(
          'step',
          {
            detail: {
              time:
                new Date(
                  this.simTime
                )
            }
          }
        )
      );
    }

    _frame(now) {
      if (!this.ready) {
        return;
      }

      const realDt =
        Math.min(
          250,
          Math.max(
            0,
            now -
            this.lastFrame
          )
        );

      this.lastFrame =
        now;

      if (
        this.playing
      ) {
        this.accumulatorSimSeconds +=
          realDt /
          1000 *
          this.speed;

        const stepSeconds =
          C.physicsStepMinutes *
          60;

        let count = 0;

        while (
          this.accumulatorSimSeconds >=
          stepSeconds &&
          count <
          C.safety
            .maxPhysicsStepsPerAnimationFrame
        ) {
          this._physicsStep();

          this.accumulatorSimSeconds -=
            stepSeconds;

          count++;
        }

        /*
         * Rework 8 performance rule:
         * slow the timelapse rather than
         * skipping physical states.
         */
        if (
          count ===
          C.safety
            .maxPhysicsStepsPerAnimationFrame &&
          this.accumulatorSimSeconds >
          stepSeconds * 2
        ) {
          this.accumulatorSimSeconds =
            stepSeconds *
            1.5;
        }
      }

      this.visualFraction =
        U.clamp(
          this.accumulatorSimSeconds /
          (
            C.physicsStepMinutes *
            60
          ),
          0,
          1
        );

      this.renderer
        .drawField(
          this.visualFraction,
          now
        );

      this.renderer
        .drawOverlay(
          this.visualFraction
        );

      this.renderer
        .drawParticles(
          this.visualFraction,
          now -
          this.lastParticleFrame
        );

      this.lastParticleFrame =
        now;

      this.dispatchEvent(
        new CustomEvent(
          'render',
          {
            detail: {
              time:
                this.displayTime()
            }
          }
        )
      );

      requestAnimationFrame(
        time =>
          this._frame(time)
      );
    }

    displayTime() {
      return new Date(
        this.simTime.getTime() +
        this.visualFraction *
        C.physicsStepMinutes *
        60000
      );
    }

    setPlaying(value) {
      this.playing =
        !!value;

      this.dispatchEvent(
        new Event(
          'playstate'
        )
      );
    }

    togglePlaying() {
      this.setPlaying(
        !this.playing
      );
    }

    setSpeed(
      simulatedSecondsPerRealSecond
    ) {
      this.speed =
        Math.max(
          1,
          Number(
            simulatedSecondsPerRealSecond
          ) ||
          1
        );
    }

    setLayer(name) {
      this.renderer
        .setLayer(name);
    }

    setRange(
      start,
      end
    ) {
      this.rangeStart =
        new Date(start);

      this.rangeEnd =
        new Date(end);

      this.dispatchEvent(
        new Event(
          'range'
        )
      );
    }

    sample(
      lat,
      lon
    ) {
      const gx =
        U.lonToX(
          lon,
          C.grid.nx
        );

      const gy =
        U.latToY(
          lat,
          C.grid.ny
        );

      const atmosphere =
        this.atmosphere;

      const tempC =
        U.bilerpArray(
          atmosphere
            .surface
            .tempC,
          gx,
          gy,
          C.grid.nx,
          C.grid.ny
        );

      const pressureHpa =
        U.bilerpArray(
          atmosphere
            .pressureHpa,
          gx,
          gy,
          C.grid.nx,
          C.grid.ny
        );

      const q =
        U.bilerpArray(
          atmosphere
            .surface
            .q,
          gx,
          gy,
          C.grid.nx,
          C.grid.ny
        );

      const rh =
        U.relativeHumidityFromQ(
          q,
          tempC,
          pressureHpa
        );

      const u =
        U.bilerpArray(
          atmosphere
            .surface
            .u,
          gx,
          gy,
          C.grid.nx,
          C.grid.ny
        );

      const v =
        U.bilerpArray(
          atmosphere
            .surface
            .v,
          gx,
          gy,
          C.grid.nx,
          C.grid.ny
        );

      const precipRate =
        U.bilerpArray(
          atmosphere
            .precipRateMmHr,
          gx,
          gy,
          C.grid.nx,
          C.grid.ny
        );

      const ix =
        Math.round(
          U.clamp(
            gx,
            0,
            C.grid.nx - 1
          )
        );

      const iy =
        Math.round(
          U.clamp(
            gy,
            0,
            C.grid.ny - 1
          )
        );

      const i =
        iy *
        C.grid.nx +
        ix;

      return {
        tempC,

        dewPointC:
          U.dewPointC(
            tempC,
            rh
          ),

        rh,

        pressureHpa,

        windMs:
          Math.hypot(
            u,
            v
          ),

        windDirectionDeg:
          (
            Math.atan2(
              -u,
              -v
            ) *
            180 /
            Math.PI +
            360
          ) %
          360,

        precipRateMmHr:
          precipRate,

        precipType:
          atmosphere
            .precipType[i],

        snowDepthCm:
          atmosphere
            .snowDepthCm[i],

        cloudCover:
          U.clamp(
            (
              atmosphere
                .layers[0]
                .cloud[i] +
              atmosphere
                .layers[1]
                .cloud[i]
            ) /
            2,
            0,
            1
          ),

        groundTempC:
          atmosphere
            .groundTempC[i],

        sstC:
          this.geography
            .landMask[i]
            ?
              null
            :
              this.ocean
                .sstC[i],

        seaIce:
          this.ocean
            .seaIce[i]
      };
    }

    addStation(
      lat,
      lon,
      name
    ) {
      const station = {
        id:
          crypto.randomUUID?.() ||
          `${Date.now()}-${Math.random()}`,

        lat,
        lon,

        name:
          name ||
          `Station ${
            this.stations.length +
            1
          }`
      };

      this.stations.push(
        station
      );

      this.dispatchEvent(
        new CustomEvent(
          'stations',
          {
            detail: {
              station
            }
          }
        )
      );

      return station;
    }

    removeStation(id) {
      this.stations =
        this.stations.filter(
          station =>
            station.id !==
            id
        );

      this.dispatchEvent(
        new Event(
          'stations'
        )
      );
    }

    addSteeringPath(
      points,
      options = {}
    ) {
      const path =
        this.synoptic
          .addSteeringPath(
            points,
            {
              ...options,

              startedAt:
                new Date(
                  this.simTime
                )
            }
          );

      this.dispatchEvent(
        new Event(
          'forcing'
        )
      );

      return path;
    }

    addPressureSystem(
      lat,
      lon,
      options = {}
    ) {
      const system =
        this.synoptic
          .addPressureSystem(
            lat,
            lon,
            {
              ...options,

              startedAt:
                new Date(
                  this.simTime
                )
            }
          );

      this.dispatchEvent(
        new Event(
          'forcing'
        )
      );

      return system;
    }

    async seek(
      target,
      onProgress =
        () => {}
    ) {
      target =
        new Date(target);

      if (
        Number.isNaN(
          target.getTime()
        )
      ) {
        throw new Error(
          'Invalid target time.'
        );
      }

      this.setPlaying(false);

      this.accumulatorSimSeconds =
        0;

      this.visualFraction =
        0;

      if (
        target.getTime() <
        this.simTime.getTime()
      ) {
        const snapshot =
          this.history
            .nearestSnapshotAtOrBefore(
              target.getTime()
            );

        if (!snapshot) {
          throw new Error(
            'That time is older than the retained simulation checkpoints.'
          );
        }

        this.history
          .restore(snapshot);
      }

      const total =
        Math.max(
          0,
          Math.ceil(
            (
              target -
              this.simTime
            ) /
            (
              C.physicsStepMinutes *
              60000
            )
          )
        );

      let done = 0;

      while (
        this.simTime <
        target
      ) {
        const batch =
          Math.min(
            C.safety
              .maxSeekStepsPerYield,

            total -
            done
          );

        for (
          let i = 0;
          i < batch &&
          this.simTime < target;
          i++
        ) {
          this._physicsStep();

          done++;
        }

        onProgress(
          total
            ?
              done /
              total
            :
              1
        );

        await U
          .nextAnimationFrame();
      }

      this.prevDisplayState =
        this.currDisplayState;

      this.currDisplayState =
        this.captureDisplayState();

      this.dispatchEvent(
        new Event(
          'seek'
        )
      );

      return this.simTime;
    }

    resetToNewScenario(
      start
    ) {
      this.setPlaying(false);

      this.simTime =
        new Date(start);

      this.prevTime =
        new Date(start);

      this.ocean.init(
        this.simTime
      );

      this.atmosphere.init(
        this.simTime
      );

      this.synoptic
        .clearSteeringPaths();

      this.synoptic
        .clearPressureSystems();

      this.history
        .snapshots
        .length = 0;

      this.history
        .stationSeries
        .clear();

      this.prevDisplayState =
        this.captureDisplayState();

      this.currDisplayState =
        this.captureDisplayState();

      this.history
        .maybeSnapshot();

      this.accumulatorSimSeconds =
        0;

      this.visualFraction =
        0;

      this.dispatchEvent(
        new Event(
          'seek'
        )
      );
    }
  }

  window.EuropaWeather =
    Object.freeze({
      WeatherWorld
    });
})();
