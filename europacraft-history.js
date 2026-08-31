(() => {
  'use strict';

  const C = EuropaConfig;

  class HistoryManager {
    constructor(world) {
      this.world =
        world;

      this.snapshots =
        [];

      this.stationSeries =
        new Map();
    }

    maybeSnapshot() {
      const minutes =
        this.world
          .simTime
          .getUTCMinutes();

      if (
        minutes %
        C.time.snapshotMinutes !==
        0
      ) {
        return;
      }

      const time =
        this.world
          .simTime
          .getTime();

      if (
        this.snapshots.length &&
        this.snapshots[
          this.snapshots.length -
          1
        ].time ===
        time
      ) {
        return;
      }

      this.snapshots.push({
        time,

        atmosphere:
          this.world
            .atmosphere
            .cloneEssential(),

        ocean: {
          sstC:
            new Float32Array(
              this.world
                .ocean
                .sstC
            ),

          seaIce:
            new Float32Array(
              this.world
                .ocean
                .seaIce
            )
        }
      });

      while (
        this.snapshots.length >
        C.time
          .maxInMemorySnapshots
      ) {
        this.snapshots.shift();
      }
    }

    nearestSnapshotAtOrBefore(
      timeMs
    ) {
      let best = null;

      for (
        const snapshot
        of this.snapshots
      ) {
        if (
          snapshot.time <=
          timeMs &&
          (
            !best ||
            snapshot.time >
            best.time
          )
        ) {
          best = snapshot;
        }
      }

      return best;
    }

    restore(snapshot) {
      if (!snapshot) {
        return false;
      }

      this.world
        .atmosphere
        .restore(
          snapshot.atmosphere
        );

      this.world
        .ocean
        .sstC
        .set(
          snapshot.ocean.sstC
        );

      this.world
        .ocean
        .seaIce
        .set(
          snapshot.ocean
            .seaIce
        );

      this.world.simTime =
        new Date(
          snapshot.time
        );

      this.world.prevTime =
        new Date(
          snapshot.time
        );

      this.world
        .prevDisplayState =
        this.world
          .captureDisplayState();

      this.world
        .currDisplayState =
        this.world
          .captureDisplayState();

      return true;
    }

    sampleStations() {
      if (
        this.world
          .simTime
          .getUTCMinutes() %
        C.time
          .stationSampleMinutes !==
        0
      ) {
        return;
      }

      for (
        const station
        of this.world.stations
      ) {
        const observation =
          this.world.sample(
            station.lat,
            station.lon
          );

        if (
          !this.stationSeries
            .has(
              station.id
            )
        ) {
          this.stationSeries
            .set(
              station.id,
              []
            );
        }

        const series =
          this.stationSeries
            .get(
              station.id
            );

        series.push({
          time:
            this.world
              .simTime
              .getTime(),

          ...observation
        });

        const cutoff =
          this.world
            .simTime
            .getTime() -
          120 *
          86400000;

        while (
          series.length &&
          series[0].time <
          cutoff
        ) {
          series.shift();
        }
      }
    }

    seriesForStation(
      id,
      dayDate =
        this.world.simTime
    ) {
      const all =
        this.stationSeries
          .get(id) ||
        [];

      const start =
        Date.UTC(
          dayDate
            .getUTCFullYear(),

          dayDate
            .getUTCMonth(),

          dayDate
            .getUTCDate()
        );

      const end =
        start +
        86400000;

      return all.filter(
        value =>
          value.time >=
          start &&
          value.time <
          end
      );
    }
  }

  window.EuropaHistory =
    Object.freeze({
      HistoryManager
    });
})();
