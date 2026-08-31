/* ============================================================================
   EuropaCraft Weather Simulator
   History, Snapshots and Weather Stations
   Version 7.2

   NEW FILE

   PURPOSE

   This file manages:

       - atmosphere snapshots
       - ocean snapshots
       - synoptic snapshots
       - backwards timeline restoration
       - station observations
       - minute-level interpolation
       - bounded history storage

   DEFAULT SIMULATION PHYSICS:

       4 minutes per physics step

   IMPORTANT

   A station may DISPLAY interpolated values at arbitrary minutes, but only
   real physics states are stored as observations.

   Example:

       simulated:
           18:32
           18:36

       requested:
           18:35

       display:
           interpolated between the two real states

   Interpolated values are presentation/history values only.

   They do NOT feed back into atmospheric physics.

============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;


/* ============================================================================
   HELPERS
============================================================================ */

function cloneFloat32(
    array
) {

    return (
        array
            ? new Float32Array(
                array
            )
            : null
    );
}


function cloneUint8(
    array
) {

    return (
        array
            ? new Uint8Array(
                array
            )
            : null
    );
}


function dateMs(
    value
) {

    if (
        value instanceof Date
    ) {

        return value.getTime();
    }


    return new Date(
        value
    ).getTime();
}


function lerpAngleDeg(
    a,
    b,
    t
) {

    let difference = (
        (
            b -
            a +
            540
        ) %
        360
    ) -
    180;


    return (
        (
            a +
            difference *
            t
        ) %
        360 +
        360
    ) %
    360;
}


/* ============================================================================
   WEATHER STATION
============================================================================ */

class WeatherStation {

    constructor(
        id,
        lat,
        lon,
        name = null
    ) {

        this.id = (
            id
        );


        this.lat = (
            Number(
                lat
            )
        );


        this.lon = (
            Number(
                lon
            )
        );


        this.name = (
            name ||
            id
        );


        this.observations = [];
    }


    /* ========================================================================
       STORE REAL SIMULATED OBSERVATION
       ======================================================================== */

    addObservation(
        observation
    ) {

        if (
            !observation
        ) {

            return;
        }


        const timestamp = (
            observation.timeMs
        );


        const last = (
            this.observations.length > 0
                ? this.observations[
                    this.observations.length - 1
                ]
                : null
        );


        /*
         * Replace observation if exact same timestamp already exists.
         */

        if (
            last &&
            last.timeMs === timestamp
        ) {

            this.observations[
                this.observations.length - 1
            ] = observation;


            return;
        }


        this.observations.push(
            observation
        );
    }


    /* ========================================================================
       REMOVE OLD HISTORY
       ======================================================================== */

    trimBefore(
        minimumTimeMs
    ) {

        let firstValid = 0;


        while (
            firstValid <
            this.observations.length &&
            this.observations[
                firstValid
            ].timeMs <
            minimumTimeMs
        ) {

            firstValid++;
        }


        if (
            firstValid > 0
        ) {

            this.observations.splice(
                0,
                firstValid
            );
        }
    }


    /* ========================================================================
       EXACT OR INTERPOLATED OBSERVATION
       ======================================================================== */

    sampleAt(
        timeInput
    ) {

        if (
            this.observations.length === 0
        ) {

            return null;
        }


        const target = (
            dateMs(
                timeInput
            )
        );


        /*
         * Outside known history.
         */

        if (
            target <=
            this.observations[0].timeMs
        ) {

            return {
                ...this.observations[0],
                interpolated: false
            };
        }


        const last = (
            this.observations[
                this.observations.length - 1
            ]
        );


        if (
            target >=
            last.timeMs
        ) {

            return {
                ...last,
                interpolated: false
            };
        }


        /*
         * Binary search.
         */

        let low = 0;

        let high = (
            this.observations.length - 1
        );


        while (
            high -
            low >
            1
        ) {

            const middle = Math.floor(
                (
                    low +
                    high
                ) /
                2
            );


            if (
                this.observations[
                    middle
                ].timeMs <=
                target
            ) {

                low = middle;
            }

            else {

                high = middle;
            }
        }


        const before = (
            this.observations[
                low
            ]
        );


        const after = (
            this.observations[
                high
            ]
        );


        if (
            target ===
            before.timeMs
        ) {

            return {
                ...before,
                interpolated: false
            };
        }


        if (
            target ===
            after.timeMs
        ) {

            return {
                ...after,
                interpolated: false
            };
        }


        const span = (
            after.timeMs -
            before.timeMs
        );


        const t = U.clamp(
            (
                target -
                before.timeMs
            ) /
            Math.max(
                1,
                span
            ),
            0,
            1
        );


        return WeatherStation.interpolateObservation(
            before,
            after,
            target,
            t
        );
    }


    /* ========================================================================
       OBSERVATION INTERPOLATION
       ======================================================================== */

    static interpolateObservation(
        a,
        b,
        targetTimeMs,
        t
    ) {

        /*
         * Values that interpolate naturally.
         */

        const linearKeys = [

            "temperatureC",

            "climatologyC",

            "anomalyC",

            "pressureHpa",

            "specificHumidity",

            "relativeHumidity",

            "windU",

            "windV",

            "windSpeed",

            "cloudFraction",

            "cloudWater",

            "precipRateMmHr",

            "groundTemperatureC",

            "snowDepthCm",

            "surfaceWetness",

            "verticalMotion",

            "convergence",

            "frontStrength",

            "boundaryLayerMixing",

            "stability",

            "sstC"
        ];


        const result = {

            timeMs:
                targetTimeMs,

            date:
                new Date(
                    targetTimeMs
                ),

            interpolated:
                true,

            interpolationFraction:
                t
        };


        for (
            const key
            of linearKeys
        ) {

            const av = (
                a[key]
            );


            const bv = (
                b[key]
            );


            if (
                Number.isFinite(
                    av
                ) &&
                Number.isFinite(
                    bv
                )
            ) {

                result[key] = U.lerp(
                    av,
                    bv,
                    t
                );
            }

            else if (
                Number.isFinite(
                    av
                )
            ) {

                result[key] = av;
            }

            else if (
                Number.isFinite(
                    bv
                )
            ) {

                result[key] = bv;
            }

            else {

                result[key] = null;
            }
        }


        /*
         * Wind direction needs circular interpolation.
         */

        if (
            Number.isFinite(
                a.windDirectionDeg
            ) &&
            Number.isFinite(
                b.windDirectionDeg
            )
        ) {

            result.windDirectionDeg = (
                lerpAngleDeg(
                    a.windDirectionDeg,
                    b.windDirectionDeg,
                    t
                )
            );
        }

        else {

            result.windDirectionDeg = null;
        }


        /*
         * Precipitation phase is categorical.

         * We choose the physically nearest real state rather than inventing a
         * fractional phase.
         */

        const nearest = (
            t < 0.5
                ? a
                : b
        );


        result.precipPhase = (
            nearest.precipPhase
        );


        result.precipPhaseName = (
            nearest.precipPhaseName
        );


        return result;
    }
}


/* ============================================================================
   HISTORY MANAGER
============================================================================ */

class HistoryManager {

    constructor(
        atmosphere,
        ocean,
        synoptic,
        terrain
    ) {

        this.atmosphere = (
            atmosphere
        );


        this.ocean = (
            ocean
        );


        this.synoptic = (
            synoptic
        );


        this.terrain = (
            terrain
        );


        this.snapshots = [];


        this.stations = [];


        this._stationCounter = 1;


        this.lastSnapshotTimeMs = null;

        this.lastStationSampleTimeMs = null;
    }


    /* ========================================================================
       HISTORY SETTINGS
       ======================================================================== */

    get snapshotIntervalMinutes() {

        return (
            Number(
                C.history.snapshotEveryMinutes
            ) ||
            60
        );
    }


    get snapshotRetentionDays() {

        return (
            Number(
                C.history.snapshotRetentionDays
            ) ||
            35
        );
    }


    get stationSampleMinutes() {

        return (
            Number(
                C.history.stationSampleEveryMinutes
            ) ||
            Number(
                C.grid.physicsStepMinutes
            ) ||
            4
        );
    }


    get stationRetentionDays() {

        return (
            Number(
                C.history.stationRetentionDays
            ) ||
            90
        );
    }


    /* ========================================================================
       STATIONS
       ======================================================================== */

    addStation(
        lat,
        lon,
        name = null
    ) {

        const id = (
            "STATION-" +
            this._stationCounter++
        );


        const station = (
            new WeatherStation(
                id,
                lat,
                lon,
                name
            )
        );


        this.stations.push(
            station
        );


        return station;
    }


    removeStation(
        stationId
    ) {

        this.stations = (
            this.stations.filter(
                station =>
                    station.id !==
                    stationId
            )
        );
    }


    clearStations() {

        this.stations.length = 0;
    }


    getStation(
        stationId
    ) {

        return (
            this.stations.find(
                station =>
                    station.id ===
                    stationId
            ) ||
            null
        );
    }


    /* ========================================================================
       RECORD AFTER A REAL PHYSICS STEP
       ======================================================================== */

    record(
        dateInput,
        forceSnapshot = false
    ) {

        const date = (
            dateInput instanceof Date
                ? dateInput
                : new Date(
                    dateInput
                )
        );


        const timeMs = (
            date.getTime()
        );


        this._recordStationsIfNeeded(
            date
        );


        this._recordSnapshotIfNeeded(
            date,
            forceSnapshot
        );


        this._trimHistory(
            timeMs
        );
    }


    /* ========================================================================
       WEATHER STATION SAMPLING
       ======================================================================== */

    _recordStationsIfNeeded(
        date
    ) {

        const timeMs = (
            date.getTime()
        );


        const intervalMs = (
            this.stationSampleMinutes *
            60 *
            1000
        );


        if (
            this.lastStationSampleTimeMs !== null &&
            timeMs -
            this.lastStationSampleTimeMs <
            intervalMs -
            1
        ) {

            return;
        }


        for (
            const station
            of this.stations
        ) {

            const sample = (
                this.atmosphere.sample(
                    station.lat,
                    station.lon
                )
            );


            station.addObservation({

                timeMs,

                date:
                    new Date(
                        timeMs
                    ),


                temperatureC:
                    sample.temperatureC,

                climatologyC:
                    sample.climatologyC,

                anomalyC:
                    sample.anomalyC,


                pressureHpa:
                    sample.pressureHpa,


                specificHumidity:
                    sample.specificHumidity,

                relativeHumidity:
                    sample.relativeHumidity,


                windU:
                    sample.windU,

                windV:
                    sample.windV,

                windSpeed:
                    sample.windSpeed,

                windDirectionDeg:
                    sample.windDirectionDeg,


                cloudFraction:
                    sample.cloudFraction,

                cloudWater:
                    sample.cloudWater,


                precipRateMmHr:
                    sample.precipRateMmHr,

                precipPhase:
                    sample.precipPhase,

                precipPhaseName:
                    sample.precipPhaseName,


                groundTemperatureC:
                    sample.groundTemperatureC,

                snowDepthCm:
                    sample.snowDepthCm,

                surfaceWetness:
                    sample.surfaceWetness,


                verticalMotion:
                    sample.verticalMotion,

                convergence:
                    sample.convergence,

                frontStrength:
                    sample.frontStrength,

                boundaryLayerMixing:
                    sample.boundaryLayerMixing,

                stability:
                    sample.stability,


                sstC:
                    sample.sstC,


                interpolated:
                    false
            });
        }


        this.lastStationSampleTimeMs = (
            timeMs
        );
    }


    /* ========================================================================
       GET STATION AT ANY MINUTE
       ======================================================================== */

    sampleStationAt(
        stationId,
        dateInput
    ) {

        const station = (
            this.getStation(
                stationId
            )
        );


        if (
            !station
        ) {

            return null;
        }


        return station.sampleAt(
            dateInput
        );
    }


    /* ========================================================================
       SNAPSHOT CREATION
       ======================================================================== */

    _recordSnapshotIfNeeded(
        date,
        force
    ) {

        const timeMs = (
            date.getTime()
        );


        const intervalMs = (
            this.snapshotIntervalMinutes *
            60 *
            1000
        );


        if (
            !force &&
            this.lastSnapshotTimeMs !== null &&
            timeMs -
            this.lastSnapshotTimeMs <
            intervalMs -
            1
        ) {

            return;
        }


        this.snapshots.push(
            this.createSnapshot(
                date
            )
        );


        this.lastSnapshotTimeMs = (
            timeMs
        );
    }


    /* ========================================================================
       FULL SIMULATION SNAPSHOT
       ======================================================================== */

    createSnapshot(
        dateInput
    ) {

        const date = (
            dateInput instanceof Date
                ? dateInput
                : new Date(
                    dateInput
                )
        );


        return {

            timeMs:
                date.getTime(),


            atmosphere:
                this.atmosphere.createSnapshot(),


            ocean:
                this._createOceanSnapshot(),


            synoptic:
                this._createSynopticSnapshot()
        };
    }


    /* ========================================================================
       OCEAN SNAPSHOT
       ======================================================================== */

    _createOceanSnapshot() {

        if (
            !this.ocean
        ) {

            return null;
        }


        return {

            sst:
                cloneFloat32(
                    this.ocean.sst
                ),

            targetSST:
                cloneFloat32(
                    this.ocean.targetSST
                ),

            thermalMemory:
                cloneFloat32(
                    this.ocean.thermalMemory
                )
        };
    }


    /* ========================================================================
       SYNOPTIC SNAPSHOT
       ======================================================================== */

    _createSynopticSnapshot() {

        if (
            !this.synoptic
        ) {

            return null;
        }


        return {

            systems:
                this.synoptic.systems.map(
                    system => ({

                        id:
                            system.id,

                        type:
                            system.type,

                        lat:
                            system.lat,

                        lon:
                            system.lon,

                        pressureHpa:
                            system.pressureHpa,

                        radiusKm:
                            system.radiusKm,

                        lifeHours:
                            system.lifeHours,

                        ageHours:
                            system.ageHours,

                        driftUms:
                            system.driftUms,

                        driftVms:
                            system.driftVms,

                        deepeningRateHpaPerHour:
                            system.deepeningRateHpaPerHour,

                        fillingRateHpaPerHour:
                            system.fillingRateHpaPerHour,

                        maturity:
                            system.maturity,

                        active:
                            system.active,

                        rotationStrength:
                            system.rotationStrength
                    })
                ),


            arrows:
                this.synoptic.arrows.map(
                    arrow => ({
                        ...arrow
                    })
                ),


            nextSystemId:
                this.synoptic._nextSystemId
        };
    }


    /* ========================================================================
       FIND SNAPSHOT AT OR BEFORE REQUESTED TIME
       ======================================================================== */

    findSnapshotBefore(
        dateInput
    ) {

        if (
            this.snapshots.length === 0
        ) {

            return null;
        }


        const target = (
            dateMs(
                dateInput
            )
        );


        let best = null;


        for (
            const snapshot
            of this.snapshots
        ) {

            if (
                snapshot.timeMs <=
                target
            ) {

                best = snapshot;
            }

            else {

                break;
            }
        }


        return best;
    }


    /* ========================================================================
       FIND NEAREST SNAPSHOT
       ======================================================================== */

    findNearestSnapshot(
        dateInput
    ) {

        if (
            this.snapshots.length === 0
        ) {

            return null;
        }


        const target = (
            dateMs(
                dateInput
            )
        );


        let best = (
            this.snapshots[0]
        );


        let bestDistance = Math.abs(
            best.timeMs -
            target
        );


        for (
            let i = 1;
            i < this.snapshots.length;
            i++
        ) {

            const candidate = (
                this.snapshots[i]
            );


            const distance = Math.abs(
                candidate.timeMs -
                target
            );


            if (
                distance <
                bestDistance
            ) {

                best = candidate;

                bestDistance = distance;
            }
        }


        return best;
    }


    /* ========================================================================
       RESTORE SNAPSHOT
       ======================================================================== */

    restoreSnapshot(
        snapshot,
        dateForDiagnostics = null
    ) {

        if (
            !snapshot
        ) {

            return false;
        }


        /* ====================================================================
           ATMOSPHERE
           ==================================================================== */

        if (
            snapshot.atmosphere
        ) {

            this.atmosphere.restoreSnapshot(
                snapshot.atmosphere
            );
        }


        /* ====================================================================
           OCEAN
           ==================================================================== */

        if (
            this.ocean &&
            snapshot.ocean
        ) {

            if (
                snapshot.ocean.sst
            ) {

                this.ocean.sst.set(
                    snapshot.ocean.sst
                );
            }


            if (
                snapshot.ocean.targetSST
            ) {

                this.ocean.targetSST.set(
                    snapshot.ocean.targetSST
                );
            }


            if (
                snapshot.ocean.thermalMemory
            ) {

                this.ocean.thermalMemory.set(
                    snapshot.ocean.thermalMemory
                );
            }
        }


        /* ====================================================================
           SYNOPTIC
           ==================================================================== */

        if (
            this.synoptic &&
            snapshot.synoptic
        ) {

            this._restoreSynoptic(
                snapshot.synoptic
            );
        }


        /* ====================================================================
           DERIVED FIELDS
           ==================================================================== */

        const diagnosticDate = (
            dateForDiagnostics
                ? (
                    dateForDiagnostics instanceof Date
                        ? dateForDiagnostics
                        : new Date(
                            dateForDiagnostics
                        )
                )
                : new Date(
                    snapshot.timeMs
                )
        );


        this.atmosphere.updateDerivedFields(
            diagnosticDate
        );


        return true;
    }


    /* ========================================================================
       RESTORE SYNOPTIC SYSTEMS
       ======================================================================== */

    _restoreSynoptic(
        data
    ) {

        this.synoptic.systems.length = 0;


        if (
            Array.isArray(
                data.systems
            )
        ) {

            for (
                const saved
                of data.systems
            ) {

                this.synoptic.systems.push(
                    new global.EuropaSynopticSystem(
                        saved
                    )
                );
            }
        }


        this.synoptic.arrows = (
            Array.isArray(
                data.arrows
            )
                ? data.arrows.map(
                    arrow => ({
                        ...arrow
                    })
                )
                : []
        );


        if (
            Number.isFinite(
                data.nextSystemId
            )
        ) {

            this.synoptic._nextSystemId = (
                data.nextSystemId
            );
        }
    }


    /* ========================================================================
       SCRUB BACK TO A SAVED STATE

       Returns the restored snapshot time.

       The higher-level weather controller will then simulate FORWARD from this
       snapshot to the exact requested minute.

       We do not try to integrate atmospheric equations backwards.
       ======================================================================== */

    restoreBefore(
        dateInput
    ) {

        const snapshot = (
            this.findSnapshotBefore(
                dateInput
            )
        );


        if (
            !snapshot
        ) {

            return null;
        }


        this.restoreSnapshot(
            snapshot
        );


        return new Date(
            snapshot.timeMs
        );
    }


    /* ========================================================================
       TRIM OLD HISTORY
       ======================================================================== */

    _trimHistory(
        currentTimeMs
    ) {

        const snapshotCutoff = (

            currentTimeMs -

            this.snapshotRetentionDays *

            24 *

            60 *

            60 *

            1000
        );


        while (
            this.snapshots.length > 0 &&
            this.snapshots[0].timeMs <
            snapshotCutoff
        ) {

            this.snapshots.shift();
        }


        const stationCutoff = (

            currentTimeMs -

            this.stationRetentionDays *

            24 *

            60 *

            60 *

            1000
        );


        for (
            const station
            of this.stations
        ) {

            station.trimBefore(
                stationCutoff
            );
        }
    }


    /* ========================================================================
       CLEAR SNAPSHOT HISTORY

       Does not delete stations themselves.
       ======================================================================== */

    clearSnapshots() {

        this.snapshots.length = 0;

        this.lastSnapshotTimeMs = null;
    }


    /* ========================================================================
       CLEAR STATION OBSERVATIONS
       ======================================================================== */

    clearStationHistory() {

        for (
            const station
            of this.stations
        ) {

            station.observations.length = 0;
        }


        this.lastStationSampleTimeMs = null;
    }


    /* ========================================================================
       INFORMATION
       ======================================================================== */

    getInfo() {

        let stationObservationCount = 0;


        for (
            const station
            of this.stations
        ) {

            stationObservationCount += (
                station.observations.length
            );
        }


        return {

            snapshots:
                this.snapshots.length,

            stations:
                this.stations.length,

            stationObservations:
                stationObservationCount,

            snapshotIntervalMinutes:
                this.snapshotIntervalMinutes,

            stationSampleMinutes:
                this.stationSampleMinutes,

            snapshotRetentionDays:
                this.snapshotRetentionDays,

            stationRetentionDays:
                this.stationRetentionDays
        };
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaHistory = HistoryManager;

global.EuropaWeatherStation = WeatherStation;

})(window);
