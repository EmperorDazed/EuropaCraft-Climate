/*
 * EuropaCraft Atmospheric Simulation
 * V10 History and Weather Station Engine
 *
 * Responsibilities:
 *
 * - Compressed full-state atmospheric rewind snapshots.
 * - Restoration of the complete prognostic atmosphere.
 * - SST restoration.
 * - Synoptic-system restoration.
 * - Air-mass record restoration.
 * - Long-duration compact weather-station observations.
 * - Historical diagnostic summaries.
 *
 *
 * WHY SNAPSHOTS ARE COMPRESSED
 * ================================================================
 *
 * V10 contains:
 *
 *   4 atmospheric levels
 *   temperature
 *   humidity
 *   U/V wind
 *   vertical motion
 *   cloud liquid
 *   cloud ice
 *   18 air-mass tracers at every level
 *
 * A raw Float32 copy of this state every hour for 35 days would consume
 * several gigabytes and would be inappropriate for a browser simulator.
 *
 * V10 therefore:
 *
 *   - quantises rewind state into compact typed arrays
 *   - keeps as many FULL snapshots as the configured memory budget allows
 *   - keeps lightweight archive summaries for a much longer period
 *   - keeps weather-station histories separately
 *
 * Rewind snapshots are sufficiently precise for continued weather
 * simulation, but are not intended to be bit-for-bit floating-point
 * reproductions of the original state.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;

    const A =
        global.EuropaAtmosphere;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-history.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-history.js"
        );
    }


    if (!A) {
        throw new Error(
            "EuropaCraft V10: europacraft-atmosphere.js must load before europacraft-history.js"
        );
    }


    const TRACER_NAMES =
        A.TRACER_NAMES;

    const TRACER_COUNT =
        TRACER_NAMES.length;

    const LEVEL_COUNT =
        A.LEVEL_KEYS.length;


    /* ================================================================
       QUANTISATION CONSTANTS
    ================================================================ */

    const TEMP_SCALE =
        100;

    const WIND_SCALE =
        100;

    const VERTICAL_SCALE =
        1000;

    const Q_SCALE =
        1000000;

    const CLOUD_SCALE =
        8000000;

    const PRESSURE_OFFSET =
        900;

    const PRESSURE_SCALE =
        10;

    const PRESSURE_TENDENCY_SCALE =
        1000;

    const GROUND_MOISTURE_SCALE =
        65535;

    const SNOW_DEPTH_SCALE =
        10;

    const SWE_SCALE =
        10;

    const FRONT_SCALE =
        10000;

    const TRACER_SCALE =
        255;

    const SST_SCALE =
        100;


    const DEFAULT_MEMORY_BUDGET_MB =
        160;


    /* ================================================================
       BASIC HELPERS
    ================================================================ */

    function finite(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);

        return (
            Number.isFinite(number)
                ? number
                : fallback
        );
    }


    function validDate(
        value
    ) {

        if (
            value instanceof Date &&
            Number.isFinite(
                value.getTime()
            )
        ) {
            return value;
        }


        const parsed =
            new Date(value);


        if (
            Number.isFinite(
                parsed.getTime()
            )
        ) {
            return parsed;
        }


        return new Date();
    }


    function makeId(
        prefix,
        counter
    ) {

        return (
            prefix +
            "-" +
            Date.now().toString(36) +
            "-" +
            counter.toString(36)
        );
    }


    /* ================================================================
       ARRAY PACKING
    ================================================================ */

    function packSigned(
        source,
        scale
    ) {

        const output =
            new Int16Array(
                source.length
            );


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            output[i] =
                U.clamp(
                    Math.round(
                        finite(
                            source[i],
                            0
                        ) *
                        scale
                    ),
                    -32768,
                    32767
                );
        }


        return output;
    }


    function unpackSigned(
        source,
        destination,
        scale
    ) {

        const inverse =
            1 /
            scale;


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            destination[i] =
                source[i] *
                inverse;
        }
    }


    function packUnsigned(
        source,
        scale,
        maximum = 65535
    ) {

        const output =
            new Uint16Array(
                source.length
            );


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            output[i] =
                U.clamp(
                    Math.round(
                        Math.max(
                            0,
                            finite(
                                source[i],
                                0
                            )
                        ) *
                        scale
                    ),
                    0,
                    maximum
                );
        }


        return output;
    }


    function unpackUnsigned(
        source,
        destination,
        scale
    ) {

        const inverse =
            1 /
            scale;


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            destination[i] =
                source[i] *
                inverse;
        }
    }


    function packPressure(
        source
    ) {

        const output =
            new Uint16Array(
                source.length
            );


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            output[i] =
                U.clamp(
                    Math.round(
                        (
                            source[i] -
                            PRESSURE_OFFSET
                        ) *
                        PRESSURE_SCALE
                    ),
                    0,
                    65535
                );
        }


        return output;
    }


    function unpackPressure(
        source,
        destination
    ) {

        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            destination[i] =
                PRESSURE_OFFSET +
                source[i] /
                PRESSURE_SCALE;
        }
    }


    function packUnitFraction(
        source
    ) {

        const output =
            new Uint16Array(
                source.length
            );


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            output[i] =
                Math.round(
                    U.clamp01(
                        finite(
                            source[i],
                            0
                        )
                    ) *
                    GROUND_MOISTURE_SCALE
                );
        }


        return output;
    }


    function unpackUnitFraction(
        source,
        destination
    ) {

        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            destination[i] =
                source[i] /
                GROUND_MOISTURE_SCALE;
        }
    }


    function packTracers(
        source
    ) {

        const output =
            new Uint8Array(
                source.length
            );


        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            output[i] =
                Math.round(
                    U.clamp01(
                        finite(
                            source[i],
                            0
                        )
                    ) *
                    TRACER_SCALE
                );
        }


        return output;
    }


    function unpackTracers(
        source,
        level
    ) {

        for (
            let i = 0;
            i < source.length;
            i++
        ) {

            level.tracers[i] =
                source[i] /
                TRACER_SCALE;
        }


        /*
         * Quantisation means individual components need normalising back
         * to exactly one after restoration.
         */

        level.normalizeAllTracers();
    }


    /* ================================================================
       SNAPSHOT SIZE ESTIMATION
    ================================================================ */

    function estimateSnapshotBytes(
        cellCount
    ) {

        /*
         * Per atmospheric level:
         *
         * temp        Int16  2
         * q           Uint16 2
         * u           Int16  2
         * v           Int16  2
         * w           Int16  2
         * liquid      Uint16 2
         * ice         Uint16 2
         * tracers     Uint8 18
         *
         * = 32 bytes per cell per level.
         */

        const levelBytes =
            cellCount *
            (
                14 +
                TRACER_COUNT
            ) *
            LEVEL_COUNT;


        /*
         * Surface/system state:
         *
         * pressure
         * pressure tendency
         * ground temperature
         * ground moisture
         * snow depth
         * SWE
         * persistent front strength
         * SST
         */

        const surfaceBytes =
            cellCount *
            16;


        /*
         * Add modest overhead for JS objects and synoptic metadata.
         */

        return (
            levelBytes +
            surfaceBytes +
            16384
        );
    }


    /* ================================================================
       WEATHER STATION
    ================================================================ */

    class WeatherStation {

        constructor(
            history,
            latitude,
            longitude,
            options = {}
        ) {

            this.history =
                history;


            this.id =
                String(
                    options.id ||
                    makeId(
                        "STATION",
                        ++history.stationCounter
                    )
                );


            this.name =
                String(
                    options.name ||
                    "Weather Station"
                );


            this.lat =
                U.clamp(
                    finite(
                        latitude,
                        50
                    ),
                    C.bounds.south,
                    C.bounds.north
                );


            this.lon =
                U.clamp(
                    finite(
                        longitude,
                        0
                    ),
                    C.bounds.west,
                    C.bounds.east
                );


            this.capacity =
                Math.max(
                    1,
                    Math.floor(
                        finite(
                            options.maxSamples,
                            C.history.maxStationSamples
                        )
                    )
                );


            this.count =
                0;

            this.head =
                0;

            this.lastSampleMs =
                -Infinity;


            /* --------------------------------------------------------
               TIME
            -------------------------------------------------------- */

            this.timeMs =
                new Float64Array(
                    this.capacity
                );


            /* --------------------------------------------------------
               THERMODYNAMICS
            -------------------------------------------------------- */

            this.tempC =
                new Float32Array(
                    this.capacity
                );

            this.anomalyC =
                new Float32Array(
                    this.capacity
                );

            this.wetBulbC =
                new Float32Array(
                    this.capacity
                );

            this.humidityPct =
                new Float32Array(
                    this.capacity
                );

            this.pressureHpa =
                new Float32Array(
                    this.capacity
                );


            /* --------------------------------------------------------
               WIND
            -------------------------------------------------------- */

            this.windSpeedMs =
                new Float32Array(
                    this.capacity
                );

            this.windFromDeg =
                new Float32Array(
                    this.capacity
                );


            /* --------------------------------------------------------
               CLOUD / PRECIPITATION
            -------------------------------------------------------- */

            this.cloudFraction =
                new Float32Array(
                    this.capacity
                );

            this.precipMmHr =
                new Float32Array(
                    this.capacity
                );

            this.rainMmHr =
                new Float32Array(
                    this.capacity
                );

            this.sleetMmHr =
                new Float32Array(
                    this.capacity
                );

            this.wetSnowMmHr =
                new Float32Array(
                    this.capacity
                );

            this.snowMmHr =
                new Float32Array(
                    this.capacity
                );

            this.phase =
                new Uint8Array(
                    this.capacity
                );


            /* --------------------------------------------------------
               SNOW / DYNAMICS
            -------------------------------------------------------- */

            this.snowDepthCm =
                new Float32Array(
                    this.capacity
                );

            this.frontStrength =
                new Float32Array(
                    this.capacity
                );

            this.totalLift =
                new Float32Array(
                    this.capacity
                );


            /* --------------------------------------------------------
               AIR-MASS IDENTITY
            -------------------------------------------------------- */

            this.airMassIndex =
                new Uint8Array(
                    this.capacity
                );

            this.airMassFraction =
                new Float32Array(
                    this.capacity
                );
        }


        record(
            date,
            sample
        ) {

            const index =
                this.head;


            this.timeMs[
                index
            ] =
                date.getTime();


            this.tempC[
                index
            ] =
                sample.tempC;


            this.anomalyC[
                index
            ] =
                sample.anomalyC;


            this.wetBulbC[
                index
            ] =
                sample.wetBulbC;


            this.humidityPct[
                index
            ] =
                sample.humidityPct;


            this.pressureHpa[
                index
            ] =
                sample.pressureHpa;


            this.windSpeedMs[
                index
            ] =
                sample.windSpeedMs;


            this.windFromDeg[
                index
            ] =
                sample.windFromDeg;


            this.cloudFraction[
                index
            ] =
                sample.cloudFraction;


            this.precipMmHr[
                index
            ] =
                sample.precipMmHr;


            this.rainMmHr[
                index
            ] =
                sample.rainMmHr;


            this.sleetMmHr[
                index
            ] =
                sample.sleetMmHr;


            this.wetSnowMmHr[
                index
            ] =
                sample.wetSnowMmHr;


            this.snowMmHr[
                index
            ] =
                sample.snowMmHr;


            const phaseIndex =
                A.PRECIPITATION_PHASE_NAMES.indexOf(
                    sample.precipitationType
                );


            this.phase[
                index
            ] =
                phaseIndex >= 0
                    ? phaseIndex
                    : A.PRECIPITATION_PHASE.DRY;


            this.snowDepthCm[
                index
            ] =
                sample.snowDepthCm;


            this.frontStrength[
                index
            ] =
                sample.frontStrength;


            this.totalLift[
                index
            ] =
                sample.totalLift;


            const dominantName =
                sample.airMass &&
                sample.airMass.dominant
                    ? sample.airMass.dominant.name
                    : TRACER_NAMES[0];


            const dominantIndex =
                Math.max(
                    0,
                    TRACER_NAMES.indexOf(
                        dominantName
                    )
                );


            this.airMassIndex[
                index
            ] =
                dominantIndex;


            this.airMassFraction[
                index
            ] =
                sample.airMass &&
                sample.airMass.dominant
                    ? sample.airMass.dominant.fraction
                    : 0;


            this.head =
                (
                    this.head +
                    1
                ) %
                this.capacity;


            this.count =
                Math.min(
                    this.capacity,
                    this.count +
                    1
                );


            this.lastSampleMs =
                date.getTime();
        }


        chronologicalIndex(
            logicalIndex
        ) {

            if (
                logicalIndex < 0 ||
                logicalIndex >=
                    this.count
            ) {

                return -1;
            }


            const oldest =
                this.count <
                    this.capacity
                    ? 0
                    : this.head;


            return (
                oldest +
                logicalIndex
            ) %
                this.capacity;
        }


        sampleObjectAt(
            logicalIndex
        ) {

            const index =
                this.chronologicalIndex(
                    logicalIndex
                );


            if (
                index <
                0
            ) {
                return null;
            }


            return {

                date:
                    new Date(
                        this.timeMs[
                            index
                        ]
                    ),

                timeMs:
                    this.timeMs[
                        index
                    ],

                tempC:
                    this.tempC[
                        index
                    ],

                anomalyC:
                    this.anomalyC[
                        index
                    ],

                wetBulbC:
                    this.wetBulbC[
                        index
                    ],

                humidityPct:
                    this.humidityPct[
                        index
                    ],

                pressureHpa:
                    this.pressureHpa[
                        index
                    ],

                windSpeedMs:
                    this.windSpeedMs[
                        index
                    ],

                windFromDeg:
                    this.windFromDeg[
                        index
                    ],

                cloudFraction:
                    this.cloudFraction[
                        index
                    ],

                precipMmHr:
                    this.precipMmHr[
                        index
                    ],

                rainMmHr:
                    this.rainMmHr[
                        index
                    ],

                sleetMmHr:
                    this.sleetMmHr[
                        index
                    ],

                wetSnowMmHr:
                    this.wetSnowMmHr[
                        index
                    ],

                snowMmHr:
                    this.snowMmHr[
                        index
                    ],

                precipitationType:
                    A.PRECIPITATION_PHASE_NAMES[
                        this.phase[
                            index
                        ]
                    ] ||
                    "dry",

                snowDepthCm:
                    this.snowDepthCm[
                        index
                    ],

                frontStrength:
                    this.frontStrength[
                        index
                    ],

                totalLift:
                    this.totalLift[
                        index
                    ],

                airMass:
                    TRACER_NAMES[
                        this.airMassIndex[
                            index
                        ]
                    ],

                airMassFraction:
                    this.airMassFraction[
                        index
                    ]
            };
        }


        series(
            options = {}
        ) {

            const sinceMs =
                Number.isFinite(
                    Number(
                        options.sinceMs
                    )
                )
                    ? Number(
                        options.sinceMs
                    )
                    : -Infinity;


            const lastHours =
                Number.isFinite(
                    Number(
                        options.lastHours
                    )
                )
                    ? Math.max(
                        0,
                        Number(
                            options.lastHours
                        )
                    )
                    : null;


            let cutoff =
                sinceMs;


            if (
                lastHours !==
                null &&
                this.count >
                    0
            ) {

                const newest =
                    this.sampleObjectAt(
                        this.count -
                        1
                    );


                cutoff =
                    Math.max(
                        cutoff,
                        newest.timeMs -
                        lastHours *
                        3600000
                    );
            }


            const result =
                [];


            for (
                let i = 0;
                i < this.count;
                i++
            ) {

                const sample =
                    this.sampleObjectAt(
                        i
                    );


                if (
                    sample.timeMs >=
                    cutoff
                ) {

                    result.push(
                        sample
                    );
                }
            }


            return result;
        }


        latest() {

            if (
                this.count ===
                0
            ) {
                return null;
            }


            return this.sampleObjectAt(
                this.count -
                1
            );
        }


        clear() {

            this.count =
                0;

            this.head =
                0;

            this.lastSampleMs =
                -Infinity;
        }
    }


    /* ================================================================
       HISTORY ENGINE
    ================================================================ */

    class History {

        constructor(
            terrain,
            ocean,
            atmosphere,
            synoptic,
            airMassManager = null,
            options = {}
        ) {

            if (!terrain) {
                throw new Error(
                    "EuropaCraft V10 History requires terrain."
                );
            }


            if (!ocean) {
                throw new Error(
                    "EuropaCraft V10 History requires ocean."
                );
            }


            if (!atmosphere) {
                throw new Error(
                    "EuropaCraft V10 History requires atmosphere."
                );
            }


            this.terrain =
                terrain;

            this.ocean =
                ocean;

            this.atmosphere =
                atmosphere;

            this.synoptic =
                synoptic;

            this.airMasses =
                airMassManager;


            this.n =
                terrain.n;


            /* ========================================================
               FULL REWIND SNAPSHOTS
            ======================================================== */

            this.snapshotEveryMs =
                C.history.snapshotEveryMinutes *
                60000;


            this.lastSnapshotMs =
                -Infinity;


            this.snapshotBytesEstimate =
                estimateSnapshotBytes(
                    this.n
                );


            this.memoryBudgetBytes =
                Math.max(
                    32,
                    finite(
                        options.maxMemoryMB,
                        DEFAULT_MEMORY_BUDGET_MB
                    )
                ) *
                1024 *
                1024;


            const memoryLimitedSnapshots =
                Math.max(
                    4,
                    Math.floor(
                        this.memoryBudgetBytes /
                        Math.max(
                            1,
                            this.snapshotBytesEstimate
                        )
                    )
                );


            this.maxFullSnapshots =
                Math.max(
                    4,
                    Math.min(
                        C.history.maxSnapshots,
                        memoryLimitedSnapshots
                    )
                );


            this.snapshots =
                [];


            /* ========================================================
               LIGHTWEIGHT ARCHIVE
            ======================================================== */

            this.archive =
                [];


            this.maxArchiveEntries =
                C.history.maxSnapshots;


            /* ========================================================
               WEATHER STATIONS
            ======================================================== */

            this.stations =
                new Map();


            this.stationCounter =
                0;


            this.stationSampleEveryMs =
                C.history.stationSampleEveryMinutes *
                60000;
        }


        /* ============================================================
           LEVEL SNAPSHOT
        ============================================================ */

        snapshotLevel(
            level
        ) {

            return {

                tempC:
                    packSigned(
                        level.tempC,
                        TEMP_SCALE
                    ),

                q:
                    packUnsigned(
                        level.q,
                        Q_SCALE
                    ),

                u:
                    packSigned(
                        level.u,
                        WIND_SCALE
                    ),

                v:
                    packSigned(
                        level.v,
                        WIND_SCALE
                    ),

                w:
                    packSigned(
                        level.w,
                        VERTICAL_SCALE
                    ),

                cloudLiquid:
                    packUnsigned(
                        level.cloudLiquid,
                        CLOUD_SCALE
                    ),

                cloudIce:
                    packUnsigned(
                        level.cloudIce,
                        CLOUD_SCALE
                    ),

                tracers:
                    packTracers(
                        level.tracers
                    )
            };
        }


        restoreLevel(
            snapshot,
            level
        ) {

            unpackSigned(
                snapshot.tempC,
                level.tempC,
                TEMP_SCALE
            );


            unpackUnsigned(
                snapshot.q,
                level.q,
                Q_SCALE
            );


            unpackSigned(
                snapshot.u,
                level.u,
                WIND_SCALE
            );


            unpackSigned(
                snapshot.v,
                level.v,
                WIND_SCALE
            );


            unpackSigned(
                snapshot.w,
                level.w,
                VERTICAL_SCALE
            );


            unpackUnsigned(
                snapshot.cloudLiquid,
                level.cloudLiquid,
                CLOUD_SCALE
            );


            unpackUnsigned(
                snapshot.cloudIce,
                level.cloudIce,
                CLOUD_SCALE
            );


            unpackTracers(
                snapshot.tracers,
                level
            );
        }


        /* ============================================================
           SYNOPTIC RECORD SNAPSHOT
        ============================================================ */

        snapshotSynopticSystems() {

            if (
                !this.synoptic
            ) {
                return [];
            }


            return this.synoptic.systems.map(
                system => ({

                    id:
                        system.id,

                    name:
                        system.name,

                    kind:
                        system.kind,

                    lat:
                        system.lat,

                    lon:
                        system.lon,

                    radiusKm:
                        system.radiusKm,

                    coreRadiusKm:
                        system.coreRadiusKm,

                    centralPressureHpa:
                        system.centralPressureHpa,

                    backgroundPressureHpa:
                        system.backgroundPressureHpa,

                    strength:
                        system.strength,

                    driftUMs:
                        system.movement.u,

                    driftVMs:
                        system.movement.v,

                    developmentHours:
                        system.developmentHours,

                    matureHours:
                        system.matureHours,

                    fillingHours:
                        system.fillingHours,

                    ageHours:
                        system.ageHours,

                    enabled:
                        system.enabled,

                    userCreated:
                        system.userCreated
                })
            );
        }


        snapshotSteeringArrows() {

            if (
                !this.synoptic
            ) {
                return [];
            }


            return this.synoptic.arrows.map(
                arrow => ({

                    id:
                        arrow.id,

                    startLat:
                        arrow.startLat,

                    startLon:
                        arrow.startLon,

                    endLat:
                        arrow.endLat,

                    endLon:
                        arrow.endLon,

                    widthKm:
                        arrow.widthKm,

                    speedKmh:
                        arrow.speedKmh,

                    strength:
                        arrow.strength,

                    levelWeights:
                        arrow.levelWeights.slice(),

                    enabled:
                        arrow.enabled,

                    ageHours:
                        arrow.ageHours,

                    lifetimeHours:
                        arrow.lifetimeHours
                })
            );
        }


        /* ============================================================
           AIR-MASS RECORD SNAPSHOT
        ============================================================ */

        snapshotAirMasses() {

            if (
                !this.airMasses
            ) {
                return [];
            }


            return this.airMasses.masses.map(
                mass => {

                    const tracerMix =
                        Object.create(
                            null
                        );


                    for (
                        let tracer = 0;
                        tracer < TRACER_COUNT;
                        tracer++
                    ) {

                        tracerMix[
                            TRACER_NAMES[
                                tracer
                            ]
                        ] =
                            mass.tracerVector[
                                tracer
                            ];
                    }


                    return {

                        id:
                            mass.id,

                        name:
                            mass.name,

                        sourceType:
                            mass.sourceType,

                        lat:
                            mass.lat,

                        lon:
                            mass.lon,

                        radiusKm:
                            mass.radiusKm,

                        coreRadiusKm:
                            mass.coreRadiusKm,

                        strength:
                            mass.strength,

                        depthLayers:
                            mass.depthLayers,

                        stability:
                            mass.stability,

                        lapseRateCPerKm:
                            mass.lapseRateCPerKm,

                        temperatureC:
                            mass.surfaceTemperatureC,

                        relativeHumidityPct:
                            mass.relativeHumidityPct,

                        specificHumidityKgKg:
                            mass.specificHumidityKgKg,

                        pressureHpa:
                            mass.pressureHpa,

                        pressureDeltaHpa:
                            mass.pressureDeltaHpa,

                        temperatureProfileC:
                            mass.temperatureProfileC
                                ? {
                                    ...mass.temperatureProfileC
                                }
                                : null,

                        relativeHumidityProfilePct:
                            mass.relativeHumidityProfilePct
                                ? {
                                    ...mass.relativeHumidityProfilePct
                                }
                                : null,

                        windProfile:
                            mass.windProfile
                                ? JSON.parse(
                                    JSON.stringify(
                                        mass.windProfile
                                    )
                                )
                                : null,

                        windUMs:
                            mass.movement.u,

                        windVMs:
                            mass.movement.v,

                        tracerMix,

                        ageHours:
                            mass.ageHours,

                        lifetimeHours:
                            mass.lifetimeHours,

                        enabled:
                            mass.enabled,

                        injected:
                            mass.injected,

                        cellsAffected:
                            mass.cellsAffected,

                        maximumAppliedWeight:
                            mass.maximumAppliedWeight
                    };
                }
            );
        }


        /* ============================================================
           FULL SNAPSHOT
        ============================================================ */

        createSnapshot(
            date
        ) {

            const a =
                this.atmosphere;


            return {

                version:
                    C.version,

                timeMs:
                    date.getTime(),

                dateISO:
                    date.toISOString(),


                levels:
                    a.levels.map(
                        level =>
                            this.snapshotLevel(
                                level
                            )
                    ),


                pressureHpa:
                    packPressure(
                        a.pressureHpa
                    ),


                pressureTendency:
                    packSigned(
                        a.pressureTendencyHpaHr,
                        PRESSURE_TENDENCY_SCALE
                    ),


                groundC:
                    packSigned(
                        a.groundC,
                        TEMP_SCALE
                    ),


                groundMoisture:
                    packUnitFraction(
                        a.groundMoisture
                    ),


                snowDepthCm:
                    packUnsigned(
                        a.snowDepthCm,
                        SNOW_DEPTH_SCALE
                    ),


                snowWaterEquivalentMm:
                    packUnsigned(
                        a.snowWaterEquivalentMm,
                        SWE_SCALE
                    ),


                frontStrength:
                    packUnsigned(
                        a.frontStrength,
                        FRONT_SCALE
                    ),


                sst:
                    packSigned(
                        this.ocean.sst,
                        SST_SCALE
                    ),


                synopticSystems:
                    this.snapshotSynopticSystems(),


                steeringArrows:
                    this.snapshotSteeringArrows(),


                airMasses:
                    this.snapshotAirMasses()
            };
        }


        /* ============================================================
           DOMAIN SUMMARY
        ============================================================ */

        createArchiveSummary(
            date
        ) {

            const a =
                this.atmosphere;


            let temperatureSum =
                0;

            let pressureSum =
                0;

            let precipitatingCells =
                0;

            let snowyCells =
                0;

            let strongestFront =
                0;

            let maximumPrecip =
                0;

            let minimumTemperature =
                Infinity;

            let maximumTemperature =
                -Infinity;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const temperature =
                    a.surface.tempC[
                        cell
                    ];


                temperatureSum +=
                    temperature;


                pressureSum +=
                    a.pressureHpa[
                        cell
                    ];


                minimumTemperature =
                    Math.min(
                        minimumTemperature,
                        temperature
                    );


                maximumTemperature =
                    Math.max(
                        maximumTemperature,
                        temperature
                    );


                const precipitation =
                    a.precipMmHr[
                        cell
                    ];


                if (
                    precipitation >
                    0.05
                ) {
                    precipitatingCells++;
                }


                if (
                    a.snowMmHr[
                        cell
                    ] >
                    0.05
                ) {
                    snowyCells++;
                }


                maximumPrecip =
                    Math.max(
                        maximumPrecip,
                        precipitation
                    );


                strongestFront =
                    Math.max(
                        strongestFront,
                        a.frontStrength[
                            cell
                        ]
                    );
            }


            return {

                timeMs:
                    date.getTime(),

                dateISO:
                    date.toISOString(),

                meanTemperatureC:
                    temperatureSum /
                    this.n,

                minimumTemperatureC:
                    minimumTemperature,

                maximumTemperatureC:
                    maximumTemperature,

                meanPressureHpa:
                    pressureSum /
                    this.n,

                precipitatingFraction:
                    precipitatingCells /
                    this.n,

                snowingFraction:
                    snowyCells /
                    this.n,

                maximumPrecipMmHr:
                    maximumPrecip,

                strongestFront
            };
        }


        /* ============================================================
           CAPTURE
        ============================================================ */

        captureSnapshot(
            date,
            force = false
        ) {

            const d =
                validDate(
                    date
                );


            const time =
                d.getTime();


            if (
                !force &&
                time -
                this.lastSnapshotMs <
                this.snapshotEveryMs
            ) {
                return null;
            }


            const snapshot =
                this.createSnapshot(
                    d
                );


            this.snapshots.push(
                snapshot
            );


            while (
                this.snapshots.length >
                this.maxFullSnapshots
            ) {

                this.snapshots.shift();
            }


            this.archive.push(
                this.createArchiveSummary(
                    d
                )
            );


            while (
                this.archive.length >
                this.maxArchiveEntries
            ) {

                this.archive.shift();
            }


            this.lastSnapshotMs =
                time;


            return snapshot;
        }


        /* ============================================================
           RESTORE SYNOPTIC STATE
        ============================================================ */

        restoreSynoptic(
            snapshot
        ) {

            if (
                !this.synoptic
            ) {
                return;
            }


            this.synoptic.clearSystems();

            this.synoptic.clearArrows();


            for (
                const record of snapshot.synopticSystems ||
                []
            ) {

                this.synoptic.addSystem({

                    ...record,

                    driftUMs:
                        record.driftUMs,

                    driftVMs:
                        record.driftVMs
                });
            }


            for (
                const record of snapshot.steeringArrows ||
                []
            ) {

                const arrow =
                    this.synoptic.addArrow(
                        record.startLat,
                        record.startLon,
                        record.endLat,
                        record.endLon,
                        {

                            id:
                                record.id,

                            widthKm:
                                record.widthKm,

                            speedKmh:
                                record.speedKmh,

                            strength:
                                record.strength,

                            levelWeights:
                                record.levelWeights,

                            enabled:
                                record.enabled,

                            lifetimeHours:
                                record.lifetimeHours
                        }
                    );


                arrow.ageHours =
                    record.ageHours;
            }


            this.synoptic.currentDate =
                new Date(
                    snapshot.timeMs
                );
        }


        /* ============================================================
           RESTORE AIR-MASS RECORDS
        ============================================================ */

        restoreAirMasses(
            snapshot
        ) {

            if (
                !this.airMasses
            ) {
                return;
            }


            this.airMasses.clear();


            this.airMasses.currentDate =
                new Date(
                    snapshot.timeMs
                );


            for (
                const record of snapshot.airMasses ||
                []
            ) {

                const mass =
                    this.airMasses.create({

                        id:
                            record.id,

                        name:
                            record.name,

                        sourceType:
                            record.sourceType,

                        lat:
                            record.lat,

                        lon:
                            record.lon,

                        radiusKm:
                            record.radiusKm,

                        coreRadiusKm:
                            record.coreRadiusKm,

                        strength:
                            record.strength,

                        depthLayers:
                            record.depthLayers,

                        stability:
                            record.stability,

                        lapseRateCPerKm:
                            record.lapseRateCPerKm,

                        temperatureC:
                            record.temperatureC,

                        relativeHumidityPct:
                            record.relativeHumidityPct,

                        specificHumidityKgKg:
                            record.specificHumidityKgKg,

                        pressureHpa:
                            record.pressureHpa,

                        pressureDeltaHpa:
                            record.pressureDeltaHpa,

                        temperatureProfileC:
                            record.temperatureProfileC,

                        relativeHumidityProfilePct:
                            record.relativeHumidityProfilePct,

                        windProfile:
                            record.windProfile,

                        windUMs:
                            record.windUMs,

                        windVMs:
                            record.windVMs,

                        tracerMix:
                            record.tracerMix,

                        lifetimeHours:
                            record.lifetimeHours,

                        enabled:
                            record.enabled,

                        inject:
                            false
                    });


                mass.ageHours =
                    record.ageHours;


                mass.injected =
                    record.injected;


                mass.cellsAffected =
                    record.cellsAffected;


                mass.maximumAppliedWeight =
                    record.maximumAppliedWeight;
            }
        }


        /* ============================================================
           RESTORE FULL ATMOSPHERE
        ============================================================ */

        restoreSnapshot(
            snapshot
        ) {

            if (!snapshot) {

                throw new Error(
                    "EuropaCraft V10 History: no snapshot supplied."
                );
            }


            if (
                !snapshot.levels ||
                snapshot.levels.length !==
                    LEVEL_COUNT
            ) {

                throw new Error(
                    "EuropaCraft V10 History: incompatible atmospheric snapshot."
                );
            }


            const a =
                this.atmosphere;


            for (
                let levelIndex = 0;
                levelIndex < LEVEL_COUNT;
                levelIndex++
            ) {

                this.restoreLevel(
                    snapshot.levels[
                        levelIndex
                    ],
                    a.levels[
                        levelIndex
                    ]
                );
            }


            unpackPressure(
                snapshot.pressureHpa,
                a.pressureHpa
            );


            unpackSigned(
                snapshot.pressureTendency,
                a.pressureTendencyHpaHr,
                PRESSURE_TENDENCY_SCALE
            );


            unpackSigned(
                snapshot.groundC,
                a.groundC,
                TEMP_SCALE
            );


            unpackUnitFraction(
                snapshot.groundMoisture,
                a.groundMoisture
            );


            unpackUnsigned(
                snapshot.snowDepthCm,
                a.snowDepthCm,
                SNOW_DEPTH_SCALE
            );


            unpackUnsigned(
                snapshot.snowWaterEquivalentMm,
                a.snowWaterEquivalentMm,
                SWE_SCALE
            );


            unpackUnsigned(
                snapshot.frontStrength,
                a.frontStrength,
                FRONT_SCALE
            );


            unpackSigned(
                snapshot.sst,
                this.ocean.sst,
                SST_SCALE
            );


            /*
             * Recalculate the seasonal SST target for the restored date,
             * but preserve the restored prognostic SST itself.
             */

            if (
                typeof this.ocean.updateSeasonalTargets ===
                "function"
            ) {

                this.ocean.updateSeasonalTargets(
                    new Date(
                        snapshot.timeMs
                    ),
                    true
                );
            }


            this.restoreSynoptic(
                snapshot
            );


            this.restoreAirMasses(
                snapshot
            );


            /*
             * Instantaneous fields are recalculated by the next physics
             * step rather than restored from obsolete diagnostics.
             */

            a.clearInstantaneousPrecipitation();

            a.clearDynamicDiagnostics();


            /*
             * frontStrength is persistent and was intentionally saved.
             * clearDynamicDiagnostics does not clear it.
             */

            a.updateAllThermodynamicDiagnostics();


            a.validate();


            return new Date(
                snapshot.timeMs
            );
        }


        /* ============================================================
           FIND / RESTORE NEAREST SNAPSHOT
        ============================================================ */

        nearestSnapshot(
            date,
            preferPast = true
        ) {

            if (
                this.snapshots.length ===
                0
            ) {
                return null;
            }


            const target =
                validDate(
                    date
                ).getTime();


            let best =
                null;

            let bestDistance =
                Infinity;


            for (
                const snapshot of this.snapshots
            ) {

                if (
                    preferPast &&
                    snapshot.timeMs >
                    target
                ) {
                    continue;
                }


                const distance =
                    Math.abs(
                        snapshot.timeMs -
                        target
                    );


                if (
                    distance <
                    bestDistance
                ) {

                    best =
                        snapshot;

                    bestDistance =
                        distance;
                }
            }


            /*
             * If no past snapshot exists, permit nearest future snapshot.
             */

            if (
                !best
            ) {

                for (
                    const snapshot of this.snapshots
                ) {

                    const distance =
                        Math.abs(
                            snapshot.timeMs -
                            target
                        );


                    if (
                        distance <
                        bestDistance
                    ) {

                        best =
                            snapshot;

                        bestDistance =
                            distance;
                    }
                }
            }


            return best;
        }


        restoreNearest(
            date,
            preferPast = true
        ) {

            const snapshot =
                this.nearestSnapshot(
                    date,
                    preferPast
                );


            if (!snapshot) {
                return null;
            }


            return this.restoreSnapshot(
                snapshot
            );
        }


        rewindHours(
            currentDate,
            hours
        ) {

            const target =
                new Date(
                    validDate(
                        currentDate
                    ).getTime() -
                    Math.max(
                        0,
                        finite(
                            hours,
                            0
                        )
                    ) *
                    3600000
                );


            return this.restoreNearest(
                target,
                true
            );
        }


        /* ============================================================
           WEATHER STATIONS
        ============================================================ */

        addStation(
            latitude,
            longitude,
            options = {}
        ) {

            const station =
                new WeatherStation(
                    this,
                    latitude,
                    longitude,
                    options
                );


            this.stations.set(
                station.id,
                station
            );


            return station;
        }


        getStation(
            id
        ) {

            return (
                this.stations.get(
                    id
                ) ||
                null
            );
        }


        removeStation(
            id
        ) {

            return this.stations.delete(
                id
            );
        }


        clearStations() {

            this.stations.clear();
        }


        sampleStation(
            station,
            date,
            force = false
        ) {

            const d =
                validDate(
                    date
                );


            const time =
                d.getTime();


            if (
                !force &&
                time -
                    station.lastSampleMs <
                this.stationSampleEveryMs
            ) {

                return null;
            }


            const sample =
                this.atmosphere.sample(
                    station.lat,
                    station.lon,
                    d
                );


            station.record(
                d,
                sample
            );


            return sample;
        }


        sampleStations(
            date,
            force = false
        ) {

            const results =
                [];


            for (
                const station of this.stations.values()
            ) {

                const sample =
                    this.sampleStation(
                        station,
                        date,
                        force
                    );


                if (
                    sample
                ) {

                    results.push({

                        stationId:
                            station.id,

                        sample
                    });
                }
            }


            return results;
        }


        stationSeries(
            id,
            options = {}
        ) {

            const station =
                this.getStation(
                    id
                );


            if (!station) {
                return [];
            }


            return station.series(
                options
            );
        }


        listStations() {

            return Array.from(
                this.stations.values()
            ).map(
                station => ({

                    id:
                        station.id,

                    name:
                        station.name,

                    lat:
                        station.lat,

                    lon:
                        station.lon,

                    sampleCount:
                        station.count,

                    latest:
                        station.latest()
                })
            );
        }


        /* ============================================================
           NORMAL HISTORY STEP
        ============================================================ */

        step(
            date
        ) {

            const d =
                validDate(
                    date
                );


            this.captureSnapshot(
                d,
                false
            );


            this.sampleStations(
                d,
                false
            );
        }


        /* ============================================================
           SNAPSHOT INFORMATION
        ============================================================ */

        listSnapshots() {

            return this.snapshots.map(
                (
                    snapshot,
                    index
                ) => ({

                    index,

                    timeMs:
                        snapshot.timeMs,

                    date:
                        new Date(
                            snapshot.timeMs
                        ),

                    dateISO:
                        snapshot.dateISO
                })
            );
        }


        listArchive() {

            return this.archive.map(
                record => ({
                    ...record,

                    date:
                        new Date(
                            record.timeMs
                        )
                })
            );
        }


        oldestSnapshotDate() {

            if (
                this.snapshots.length ===
                0
            ) {
                return null;
            }


            return new Date(
                this.snapshots[0]
                    .timeMs
            );
        }


        newestSnapshotDate() {

            if (
                this.snapshots.length ===
                0
            ) {
                return null;
            }


            return new Date(
                this.snapshots[
                    this.snapshots.length -
                    1
                ].timeMs
            );
        }


        /* ============================================================
           MEMORY DIAGNOSTICS
        ============================================================ */

        memoryStats() {

            const estimatedSnapshotMemory =
                this.snapshots.length *
                this.snapshotBytesEstimate;


            let stationBytes =
                0;


            for (
                const station of this.stations.values()
            ) {

                /*
                 * Approximate typed-array memory.
                 */

                stationBytes +=
                    station.capacity *
                    (
                        8 +       // timestamp
                        4 * 15 +  // float fields
                        1 * 2     // uint8 fields
                    );
            }


            return {

                estimatedBytesPerSnapshot:
                    this.snapshotBytesEstimate,

                estimatedMBPerSnapshot:
                    this.snapshotBytesEstimate /
                    1024 /
                    1024,

                fullSnapshotCount:
                    this.snapshots.length,

                maximumFullSnapshots:
                    this.maxFullSnapshots,

                estimatedSnapshotMemoryMB:
                    estimatedSnapshotMemory /
                    1024 /
                    1024,

                configuredMemoryBudgetMB:
                    this.memoryBudgetBytes /
                    1024 /
                    1024,

                archiveEntries:
                    this.archive.length,

                stationCount:
                    this.stations.size,

                estimatedStationMemoryMB:
                    stationBytes /
                    1024 /
                    1024
            };
        }


        /* ============================================================
           CLEAR
        ============================================================ */

        clearSnapshots() {

            this.snapshots.length =
                0;

            this.archive.length =
                0;

            this.lastSnapshotMs =
                -Infinity;
        }


        clearAll() {

            this.clearSnapshots();

            this.clearStations();
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaHistory =
        Object.freeze({

            History,

            WeatherStation,

            estimateSnapshotBytes
        });

})(window);
