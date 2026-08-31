(() => {
  'use strict';

  const U = EuropaUtils;
  const C = EuropaConfig;

  function nearestOnPolyline(
    lat,
    lon,
    points
  ) {
    let best = {
      dKm: 1e9,
      east: 0,
      north: 0
    };

    for (
      let i = 0;
      i < points.length - 1;
      i++
    ) {
      const a =
        points[i];

      const b =
        points[i + 1];

      const meanLat =
        (
          a.lat +
          b.lat
        ) *
        0.5;

      const latScale =
        111.2;

      const lonScale =
        111.2 *
        Math.cos(
          U.degToRad(
            meanLat
          )
        );

      const ax =
        a.lon *
        lonScale;

      const ay =
        a.lat *
        latScale;

      const bx =
        b.lon *
        lonScale;

      const by =
        b.lat *
        latScale;

      const px =
        lon *
        lonScale;

      const py =
        lat *
        latScale;

      const vx =
        bx - ax;

      const vy =
        by - ay;

      const vv =
        vx * vx +
        vy * vy ||
        1;

      const t =
        U.clamp(
          (
            (
              px - ax
            ) *
            vx +
            (
              py - ay
            ) *
            vy
          ) /
          vv,
          0,
          1
        );

      const qx =
        ax +
        t *
        vx;

      const qy =
        ay +
        t *
        vy;

      const distance =
        Math.hypot(
          px - qx,
          py - qy
        );

      if (
        distance <
        best.dKm
      ) {
        const magnitude =
          Math.hypot(
            vx,
            vy
          ) ||
          1;

        best = {
          dKm: distance,
          east:
            vx /
            magnitude,
          north:
            vy /
            magnitude
        };
      }
    }

    return best;
  }

  class SynopticController {
    constructor() {
      this.paths = [];

      this.pressureSystems =
        [];
    }

    addSteeringPath(
      points,
      options = {}
    ) {
      if (
        !points ||
        points.length < 2
      ) {
        return null;
      }

      if (
        this.paths.length >=
        C.forcing
          .maxSteeringPaths
      ) {
        this.paths.shift();
      }

      const path = {
        id:
          crypto.randomUUID?.() ||
          `${Date.now()}-${Math.random()}`,

        points:
          points.map(
            point => ({
              lat: point.lat,
              lon: point.lon
            })
          ),

        widthKm:
          options.widthKm ??
          C.forcing
            .defaultWidthKm,

        speedKmh:
          U.clamp(
            options.speedKmh ??
            C.forcing
              .defaultSpeedKmh,
            0,
            C.forcing
              .maxSpeedKmh
          ),

        strength:
          U.clamp(
            options.strength ??
            C.forcing
              .defaultStrength,
            0,
            1
          ),

        startedAt:
          options.startedAt
            ?
              new Date(
                options.startedAt
              )
            :
              null,

        durationHours:
          options.durationHours ??
          Infinity,

        verticalInfluence:
          U.clamp(
            options
              .verticalInfluence ??
            0.65,
            0,
            1
          )
      };

      this.paths.push(path);

      return path;
    }

    clearSteeringPaths() {
      this.paths.length = 0;
    }

    addPressureSystem(
      lat,
      lon,
      options = {}
    ) {
      if (
        this.pressureSystems
          .length >=
        C.forcing
          .maxPressureSystems
      ) {
        this.pressureSystems
          .shift();
      }

      const system = {
        id:
          crypto.randomUUID?.() ||
          `${Date.now()}-${Math.random()}`,

        lat,
        lon,

        targetHpa:
          U.clamp(
            options.targetHpa ??
            990,
            C.physics
              .minPressureHpa,
            C.physics
              .maxPressureHpa
          ),

        radiusKm:
          options.radiusKm ??
          650,

        strength:
          U.clamp(
            options.strength ??
            0.65,
            0,
            1
          ),

        durationHours:
          options.durationHours ??
          48,

        driftEastMs:
          options.driftEastMs ??
          0,

        driftNorthMs:
          options.driftNorthMs ??
          0,

        startedAt:
          options.startedAt
            ?
              new Date(
                options.startedAt
              )
            :
              null
      };

      this.pressureSystems
        .push(system);

      return system;
    }

    clearPressureSystems() {
      this.pressureSystems
        .length = 0;
    }

    _active(
      startedAt,
      durationHours,
      date
    ) {
      if (!startedAt) {
        return true;
      }

      return (
        date -
        startedAt
      ) /
      3600000 <=
      durationHours;
    }

    steeringAt(
      lat,
      lon,
      date,
      layerIndex = 0
    ) {
      let u = 0;
      let v = 0;
      let total = 0;

      for (
        const path
        of this.paths
      ) {
        if (
          !this._active(
            path.startedAt,
            path.durationHours,
            date
          )
        ) {
          continue;
        }

        const nearest =
          nearestOnPolyline(
            lat,
            lon,
            path.points
          );

        const falloff =
          Math.exp(
            -0.5 *
            (
              nearest.dKm /
              Math.max(
                20,
                path.widthKm *
                0.5
              )
            ) **
            2
          );

        const vertical =
          U.lerp(
            1,
            0.35,
            layerIndex /
            (
              C.layers.length -
              1
            )
          ) *
          (
            0.35 +
            0.65 *
            path
              .verticalInfluence
          );

        const weight =
          falloff *
          path.strength *
          vertical;

        const speed =
          path.speedKmh /
          3.6;

        u +=
          nearest.east *
          speed *
          weight;

        v +=
          nearest.north *
          speed *
          weight;

        total +=
          weight;
      }

      return {
        u,
        v,

        weight:
          U.clamp(
            total,
            0,
            1
          )
      };
    }

    pressureTendencyAt(
      lat,
      lon,
      date,
      currentHpa,
      dtHours
    ) {
      let delta = 0;

      for (
        const system
        of this.pressureSystems
      ) {
        if (
          !this._active(
            system.startedAt,
            system.durationHours,
            date
          )
        ) {
          continue;
        }

        const distance =
          U.haversineKm(
            lat,
            lon,
            system.lat,
            system.lon
          );

        const falloff =
          Math.exp(
            -0.5 *
            (
              distance /
              Math.max(
                50,
                system.radiusKm *
                0.55
              )
            ) **
            2
          );

        delta +=
          (
            system.targetHpa -
            currentHpa
          ) *
          system.strength *
          falloff *
          0.08 *
          dtHours;
      }

      return delta;
    }

    advance(
      date,
      dtHours
    ) {
      for (
        const system
        of this.pressureSystems
      ) {
        const kmPerDegLat =
          111.2;

        system.lat +=
          (
            system
              .driftNorthMs *
            3.6 *
            dtHours
          ) /
          kmPerDegLat;

        const kmPerDegLon =
          111.2 *
          Math.max(
            0.2,
            Math.cos(
              U.degToRad(
                system.lat
              )
            )
          );

        system.lon +=
          (
            system
              .driftEastMs *
            3.6 *
            dtHours
          ) /
          kmPerDegLon;
      }

      this.paths =
        this.paths.filter(
          path =>
            this._active(
              path.startedAt,
              path.durationHours,
              date
            )
        );

      this.pressureSystems =
        this.pressureSystems
          .filter(
            system =>
              this._active(
                system.startedAt,
                system
                  .durationHours,
                date
              )
          );
    }
  }

  window.EuropaSynoptic =
    Object.freeze({
      SynopticController
    });
})();
