/*
 * EuropaCraft Atmospheric Simulation
 * V10.0.1 Weather Orchestrator
 *
 * Boot-safe V10 orchestrator.
 *
 * IMPORTANT:
 * Dependencies are validated when Weather is CONSTRUCTED, not while this
 * JavaScript file is merely loading. Therefore window.EuropaWeather is
 * always registered if this file parses successfully.
 */

(function (global) {
"use strict";


/* =====================================================================
   HELPERS
===================================================================== */

function finite(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function validDate(value) {

    if (
        value instanceof Date &&
        Number.isFinite(value.getTime())
    ) {
        return new Date(value.getTime());
    }


    const date = new Date(value);


    if (
        Number.isFinite(date.getTime())
    ) {
        return date;
    }


    return new Date();
}


function requireModule(name) {

    const value = global[name];


    if (!value) {

        throw new Error(
            "EuropaCraft V10: required module " +
            name +
            " is not available."
        );
    }


    return value;
}


/* =====================================================================
   WEATHER
===================================================================== */

class Weather {

    constructor(options = {}) {

        /*
         * Resolve dependencies HERE rather than at file-load time.
         *
         * This is deliberate. A failure in another module must not stop
         * EuropaWeather itself from being exported.
         */

        this.C =
            requireModule(
                "EuropaConfig"
            );


        this.U =
            requireModule(
                "EuropaUtils"
            );


        this.TerrainModule =
            requireModule(
                "EuropaTerrain"
            );


        this.OceanModule =
            requireModule(
                "EuropaOcean"
            );


        this.AtmosphereModule =
            requireModule(
                "EuropaAtmosphere"
            );


        this.AirMassModule =
            requireModule(
                "EuropaAirMasses"
            );


        this.SynopticModule =
            requireModule(
                "EuropaSynoptic"
            );


        this.MicrophysicsModule =
            requireModule(
                "EuropaMicrophysics"
            );


        this.PhysicsModule =
            requireModule(
                "EuropaPhysics"
            );


        this.HistoryModule =
            requireModule(
                "EuropaHistory"
            );


        this.climate =
            requireModule(
                "EuropaClimate"
            );


        if (
            typeof this.climate.getClimate !==
            "function"
        ) {

            throw new Error(
                "EuropaCraft V10: EuropaClimate.getClimate() is missing."
            );
        }


        if (
            typeof this.climate.getBaselineTemperature !==
            "function"
        ) {

            throw new Error(
                "EuropaCraft V10: EuropaClimate.getBaselineTemperature() is missing. " +
                "The V10 climate module is required."
            );
        }


        /* =============================================================
           CLOCK
        ============================================================= */

        this.currentDate =
            validDate(
                options.date ||
                new Date()
            );


        this.initialDate =
            new Date(
                this.currentDate.getTime()
            );


        this.physicsStepMinutes =
            finite(
                this.C.time.physicsStepMinutes,
                4
            );


        if (
            this.physicsStepMinutes <=
            0
        ) {

            throw new Error(
                "EuropaCraft V10: physicsStepMinutes must be positive."
            );
        }


        this.physicsSteps =
            0;


        this.simulatedMinutes =
            0;


        this.revision =
            0;


        this.paused =
            options.paused ===
            true;


        this.playbackMinutesPerTick =
            Math.max(
                this.physicsStepMinutes,
                finite(
                    options.playbackMinutesPerTick,
                    60
                )
            );


        this.queuedMinutes =
            0;


        /* =============================================================
           EVENTS
        ============================================================= */

        this.listeners =
            new Map();


        /* =============================================================
           TERRAIN
        ============================================================= */

        this.terrain =
            options.terrain ||
            new this.TerrainModule.Terrain(
                options.terrainOptions ||
                {}
            );


        /* =============================================================
           OCEAN
        ============================================================= */

        this.ocean =
            options.ocean ||
            new this.OceanModule.Ocean(
                this.terrain,
                this.currentDate
            );


        /* =============================================================
           ATMOSPHERE
        ============================================================= */

        this.atmosphere =
            options.atmosphere ||
            new this.AtmosphereModule.Atmosphere(
                this.terrain,
                this.ocean,
                this.currentDate
            );


        /* =============================================================
           SYNOPTIC
        ============================================================= */

        this.synoptic =
            options.synoptic ||
            new this.SynopticModule.Synoptic(
                this.terrain,
                {

                    date:
                        this.currentDate,

                    seed:
                        finite(
                            options.synopticSeed,
                            20261001
                        ),

                    seedDefaultSystems:
                        options.seedDefaultSystems !==
                        false
                }
            );


        /* =============================================================
           AIR MASSES
        ============================================================= */

        this.airMasses =
            options.airMasses ||
            new this.AirMassModule.AirMassManager(
                this.terrain,
                this.atmosphere,
                {

                    date:
                        this.currentDate,

                    seed:
                        finite(
                            options.airMassSeed,
                            20261002
                        )
                }
            );


        /* =============================================================
           MICROPHYSICS
        ============================================================= */

        this.microphysics =
            options.microphysics ||
            new this.MicrophysicsModule.Microphysics(
                this.terrain,
                this.ocean,
                this.atmosphere
            );


        /* =============================================================
           PHYSICS
        ============================================================= */

        this.physics =
            options.physics ||
            new this.PhysicsModule.Physics(
                this.terrain,
                this.ocean,
                this.atmosphere,
                this.synoptic,
                this.airMasses,
                this.microphysics
            );


        /* =============================================================
           HISTORY
        ============================================================= */

        this.history =
            options.history ||
            new this.HistoryModule.History(
                this.terrain,
                this.ocean,
                this.atmosphere,
                this.synoptic,
                this.airMasses,
                options.historyOptions ||
                {}
            );


        /* =============================================================
           OPTIONAL LONG-RUN SYNOPTIC MAINTENANCE
        ============================================================= */

        this.autoSynoptic =
            options.autoSynoptic ===
            true;


        this.lastSynopticMaintenanceMs =
            this.currentDate.getTime();


        /* =============================================================
           INITIAL SNAPSHOT
        ============================================================= */

        if (
            typeof this.history.captureSnapshot ===
            "function"
        ) {

            this.history.captureSnapshot(
                this.currentDate,
                true
            );
        }


        this.validate();
    }


    /* =================================================================
       EVENTS
    ================================================================= */

    on(eventName, callback) {

        if (
            typeof callback !==
            "function"
        ) {

            return function () {};
        }


        if (
            !this.listeners.has(eventName)
        ) {

            this.listeners.set(
                eventName,
                new Set()
            );
        }


        const set =
            this.listeners.get(
                eventName
            );


        set.add(callback);


        return () => {

            set.delete(callback);
        };
    }


    off(eventName, callback) {

        const set =
            this.listeners.get(
                eventName
            );


        if (!set) {
            return false;
        }


        return set.delete(callback);
    }


    emit(eventName, payload = {}) {

        const set =
            this.listeners.get(
                eventName
            );


        if (!set) {
            return;
        }


        for (
            const callback of set
        ) {

            try {

                callback(payload);
            }
            catch (error) {

                console.error(
                    "EuropaCraft V10 listener error:",
                    error
                );
            }
        }
    }


    /* =================================================================
       CLOCK
    ================================================================= */

    get date() {

        return new Date(
            this.currentDate.getTime()
        );
    }


    get timeMs() {

        return this.currentDate.getTime();
    }


    get isPaused() {

        return this.paused;
    }


    play() {

        this.paused =
            false;


        return this.paused;
    }


    pause() {

        this.paused =
            true;


        return this.paused;
    }


    togglePause() {

        this.paused =
            !this.paused;


        return this.paused;
    }


    setPlaybackMinutesPerTick(minutes) {

        this.playbackMinutesPerTick =
            Math.max(
                this.physicsStepMinutes,
                finite(
                    minutes,
                    this.playbackMinutesPerTick
                )
            );


        return this.playbackMinutesPerTick;
    }


    /* =================================================================
       ONE PHYSICAL STEP
    ================================================================= */

    _physicsStep(
        minutes = this.physicsStepMinutes,
        recordHistory = true
    ) {

        const stepMinutes =
            Math.min(
                this.physicsStepMinutes,
                Math.max(
                    0.0001,
                    finite(
                        minutes,
                        this.physicsStepMinutes
                    )
                )
            );


        const nextDate =
            new Date(
                this.currentDate.getTime() +
                stepMinutes *
                60000
            );


        /*
         * The Physics module owns atmospheric evolution.
         *
         * A fast simulation therefore calls this repeatedly rather than
         * passing a giant timestep.
         */

        this.physics.step(
            nextDate,
            stepMinutes
        );


        this.currentDate =
            nextDate;


        this.physicsSteps++;


        this.simulatedMinutes +=
            stepMinutes;


        this.revision++;


        if (
            recordHistory &&
            this.history &&
            typeof this.history.step ===
                "function"
        ) {

            this.history.step(
                this.currentDate
            );
        }


        if (
            this.autoSynoptic
        ) {

            this.maintainSynopticEnvironment();
        }


        return this.currentDate;
    }


    /* =================================================================
       DIRECT ADVANCE
    ================================================================= */

    advanceMinutes(
        minutes,
        options = {}
    ) {

        let remaining =
            Math.max(
                0,
                finite(
                    minutes,
                    0
                )
            );


        const recordHistory =
            options.recordHistory !==
            false;


        const startingSteps =
            this.physicsSteps;


        const startingMs =
            this.currentDate.getTime();


        while (
            remaining >
            1e-9
        ) {

            const step =
                Math.min(
                    this.physicsStepMinutes,
                    remaining
                );


            this._physicsStep(
                step,
                recordHistory
            );


            remaining -=
                step;
        }


        return {

            advancedMinutes:
                (
                    this.currentDate.getTime() -
                    startingMs
                ) /
                60000,

            physicsSteps:
                this.physicsSteps -
                startingSteps,

            date:
                this.date
        };
    }


    advanceHours(
        hours,
        options = {}
    ) {

        return this.advanceMinutes(
            Math.max(
                0,
                finite(
                    hours,
                    0
                )
            ) *
            60,
            options
        );
    }


    advanceDays(
        days,
        options = {}
    ) {

        return this.advanceMinutes(
            Math.max(
                0,
                finite(
                    days,
                    0
                )
            ) *
            1440,
            options
        );
    }


    step() {

        return this.advanceMinutes(
            this.physicsStepMinutes
        );
    }


    tick() {

        if (
            this.paused
        ) {

            return {

                paused:
                    true,

                advancedMinutes:
                    0,

                physicsSteps:
                    0,

                date:
                    this.date
            };
        }


        return this.advanceMinutes(
            this.playbackMinutesPerTick
        );
    }


    /* =================================================================
       FRAME QUEUE
    ================================================================= */

    queueAdvance(minutes) {

        this.queuedMinutes +=
            Math.max(
                0,
                finite(
                    minutes,
                    0
                )
            );


        return this.queuedMinutes;
    }


    clearAdvanceQueue() {

        this.queuedMinutes =
            0;
    }


    processQueuedFrame(
        maxSteps = null
    ) {

        const configuredMaximum =
            finite(
                this.C.time.maxStepsPerFrame,
                150
            );


        const stepLimit =
            Math.max(
                1,
                Math.floor(
                    finite(
                        maxSteps,
                        configuredMaximum
                    )
                )
            );


        let steps =
            0;


        let advancedMinutes =
            0;


        while (
            this.queuedMinutes >
                1e-9 &&
            steps <
                stepLimit
        ) {

            const stepMinutes =
                Math.min(
                    this.physicsStepMinutes,
                    this.queuedMinutes
                );


            this._physicsStep(
                stepMinutes,
                true
            );


            this.queuedMinutes -=
                stepMinutes;


            advancedMinutes +=
                stepMinutes;


            steps++;
        }


        if (
            this.queuedMinutes <
            1e-9
        ) {

            this.queuedMinutes =
                0;
        }


        return {

            advancedMinutes,

            physicsSteps:
                steps,

            queuedMinutesRemaining:
                this.queuedMinutes,

            complete:
                this.queuedMinutes <=
                0,

            date:
                this.date
        };
    }


    /* =================================================================
       AIR MASSES
    ================================================================= */

    createAirMass(options = {}) {

        const mass =
            this.airMasses.create({

                ...options,

                date:
                    this.currentDate
            });


        this.revision++;


        return mass;
    }


    createPresetAirMass(
        sourceType,
        latitude,
        longitude,
        options = {}
    ) {

        return this.createAirMass({

            ...options,

            sourceType,

            lat:
                latitude,

            lon:
                longitude
        });
    }


    createCollisionTest(options = {}) {

        const pair =
            this.airMasses.createCollisionPair({

                ...options,

                date:
                    this.currentDate
            });


        this.revision++;


        return pair;
    }


    listAirMasses() {

        if (
            typeof this.airMasses.list ===
            "function"
        ) {

            return this.airMasses.list();
        }


        return [];
    }


    clearAirMassRecords() {

        this.airMasses.clear();
    }


    /* =================================================================
       PRESSURE SYSTEMS
    ================================================================= */

    addLow(
        latitude,
        longitude,
        centralPressureHpa = 990,
        options = {}
    ) {

        const system =
            this.synoptic.addLow(
                latitude,
                longitude,
                centralPressureHpa,
                options
            );


        this.revision++;


        return system;
    }


    addHigh(
        latitude,
        longitude,
        centralPressureHpa = 1028,
        options = {}
    ) {

        const system =
            this.synoptic.addHigh(
                latitude,
                longitude,
                centralPressureHpa,
                options
            );


        this.revision++;


        return system;
    }


    removePressureSystem(id) {

        const result =
            this.synoptic.removeSystem(
                id
            );


        this.revision++;


        return result;
    }


    clearPressureSystems() {

        this.synoptic.clearSystems();


        this.revision++;
    }


    listPressureSystems() {

        if (
            typeof this.synoptic.listSystems ===
            "function"
        ) {

            return this.synoptic.listSystems();
        }


        return [];
    }


    /* =================================================================
       STEERING
    ================================================================= */

    addSteeringArrow(
        startLat,
        startLon,
        endLat,
        endLon,
        options = {}
    ) {

        const arrow =
            this.synoptic.addArrow(
                startLat,
                startLon,
                endLat,
                endLon,
                options
            );


        this.revision++;


        return arrow;
    }


    removeSteeringArrow(id) {

        const result =
            this.synoptic.removeArrow(
                id
            );


        this.revision++;


        return result;
    }


    clearSteeringArrows() {

        this.synoptic.clearArrows();


        this.revision++;
    }


    listSteeringArrows() {

        if (
            typeof this.synoptic.listArrows ===
            "function"
        ) {

            return this.synoptic.listArrows();
        }


        return [];
    }


    /* =================================================================
       WEATHER STATIONS
    ================================================================= */

    addStation(
        latitude,
        longitude,
        options = {}
    ) {

        const station =
            this.history.addStation(
                latitude,
                longitude,
                options
            );


        if (
            typeof this.history.sampleStation ===
            "function"
        ) {

            this.history.sampleStation(
                station,
                this.currentDate,
                true
            );
        }


        return station;
    }


    getStation(id) {

        return this.history.getStation(
            id
        );
    }


    removeStation(id) {

        return this.history.removeStation(
            id
        );
    }


    stationSeries(
        id,
        options = {}
    ) {

        return this.history.stationSeries(
            id,
            options
        );
    }


    listStations() {

        return this.history.listStations();
    }


    /* =================================================================
       SAMPLING
    ================================================================= */

    sample(
        latitude,
        longitude
    ) {

        return this.atmosphere.sample(
            latitude,
            longitude,
            this.currentDate
        );
    }


    terrainAt(
        latitude,
        longitude
    ) {

        return this.terrain.sample(
            latitude,
            longitude
        );
    }


    oceanAt(
        latitude,
        longitude
    ) {

        if (
            typeof this.ocean.diagnosticsAt ===
            "function"
        ) {

            return this.ocean.diagnosticsAt(
                latitude,
                longitude
            );
        }


        return null;
    }


    microphysicsAt(
        latitude,
        longitude
    ) {

        if (
            typeof this.microphysics.diagnosticsAt ===
            "function"
        ) {

            return this.microphysics.diagnosticsAt(
                latitude,
                longitude
            );
        }


        return null;
    }


    precipitationDiagnosisAt(
        latitude,
        longitude
    ) {

        if (
            typeof this.physics.precipitationDiagnosisAt ===
            "function"
        ) {

            return this.physics.precipitationDiagnosisAt(
                latitude,
                longitude
            );
        }


        return {

            diagnosis:
                "Precipitation diagnostics unavailable."
        };
    }


    /* =================================================================
       HISTORY / REWIND
    ================================================================= */

    restoreSnapshot(snapshot) {

        if (
            !snapshot
        ) {

            return null;
        }


        const restoredDate =
            this.history.restoreSnapshot(
                snapshot
            );


        if (
            !restoredDate
        ) {

            return null;
        }


        this.currentDate =
            validDate(
                restoredDate
            );


        this.queuedMinutes =
            0;


        this.revision++;


        return this.date;
    }


    rewindHours(hours) {

        const amount =
            Math.max(
                0,
                finite(
                    hours,
                    0
                )
            );


        const targetDate =
            new Date(
                this.currentDate.getTime() -
                amount *
                3600000
            );


        const snapshot =
            this.history.nearestSnapshot(
                targetDate,
                true
            );


        if (!snapshot) {

            return null;
        }


        this.restoreSnapshot(
            snapshot
        );


        /*
         * The snapshot may be older than the exact desired target.
         * Physically integrate from that checkpoint to the target.
         */

        const remainingMinutes =
            (
                targetDate.getTime() -
                this.currentDate.getTime()
            ) /
            60000;


        if (
            remainingMinutes >
            0.0001
        ) {

            this.advanceMinutes(
                remainingMinutes,
                {

                    recordHistory:
                        false
                }
            );
        }


        return this.date;
    }


    /* =================================================================
       COLLISION TEST HELPER
    ================================================================= */

    runCollisionDevelopmentTest(
        options = {}
    ) {

        const hours =
            Math.max(
                0.25,
                finite(
                    options.hours,
                    12
                )
            );


        const pair =
            this.createCollisionTest(
                options
            );


        const startingDate =
            this.date;


        const result =
            this.advanceHours(
                hours
            );


        return {

            pair,

            startingDate,

            endingDate:
                this.date,

            simulatedHours:
                hours,

            physicsSteps:
                result.physicsSteps
        };
    }


    /* =================================================================
       OPTIONAL SYNOPTIC MAINTENANCE
    ================================================================= */

    setAutoSynoptic(enabled) {

        this.autoSynoptic =
            !!enabled;


        return this.autoSynoptic;
    }


    maintainSynopticEnvironment() {

        const elapsedHours =
            (
                this.currentDate.getTime() -
                this.lastSynopticMaintenanceMs
            ) /
            3600000;


        if (
            elapsedHours <
            6
        ) {

            return;
        }


        this.lastSynopticMaintenanceMs =
            this.currentDate.getTime();


        const activeLows =
            this.synoptic.systems.filter(
                system =>
                    system.enabled &&
                    system.kind ===
                    "low"
            );


        const activeHighs =
            this.synoptic.systems.filter(
                system =>
                    system.enabled &&
                    system.kind ===
                    "high"
            );


        if (
            activeLows.length ===
            0
        ) {

            this.synoptic.addLow(
                55,
                -21,
                988,
                {

                    name:
                        "Atlantic Cyclone",

                    radiusKm:
                        1100,

                    strength:
                        0.82,

                    bearingDeg:
                        75,

                    speedKmh:
                        34,

                    developmentHours:
                        18,

                    matureHours:
                        42,

                    fillingHours:
                        54
                }
            );
        }


        if (
            activeHighs.length ===
            0
        ) {

            this.synoptic.addHigh(
                38,
                -14,
                1028,
                {

                    name:
                        "Atlantic Ridge",

                    radiusKm:
                        1450,

                    strength:
                        0.68,

                    bearingDeg:
                        65,

                    speedKmh:
                        12,

                    developmentHours:
                        36,

                    matureHours:
                        84,

                    fillingHours:
                        84
                }
            );
        }
    }


    /* =================================================================
       DOMAIN STATISTICS
    ================================================================= */

    statistics() {

        const atmosphere =
            this.atmosphere;


        const n =
            this.terrain.n;


        let minimumTemperature =
            Infinity;


        let maximumTemperature =
            -Infinity;


        let temperatureSum =
            0;


        let minimumPressure =
            Infinity;


        let maximumPressure =
            -Infinity;


        let pressureSum =
            0;


        let maximumWind =
            0;


        let maximumPrecipitation =
            0;


        let maximumSnowfall =
            0;


        let maximumSnowDepth =
            0;


        let maximumFront =
            0;


        let maximumLift =
            0;


        let precipitatingCells =
            0;


        let rainCells =
            0;


        let sleetCells =
            0;


        let wetSnowCells =
            0;


        let snowCells =
            0;


        const PHASE =
            this.AtmosphereModule
                .PRECIPITATION_PHASE;


        for (
            let cell = 0;
            cell < n;
            cell++
        ) {

            const temperature =
                atmosphere.surface.tempC[
                    cell
                ];


            const pressure =
                atmosphere.pressureHpa[
                    cell
                ];


            const wind =
                Math.hypot(
                    atmosphere.surface.u[
                        cell
                    ],
                    atmosphere.surface.v[
                        cell
                    ]
                );


            const precip =
                atmosphere.precipMmHr[
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


            temperatureSum +=
                temperature;


            minimumPressure =
                Math.min(
                    minimumPressure,
                    pressure
                );


            maximumPressure =
                Math.max(
                    maximumPressure,
                    pressure
                );


            pressureSum +=
                pressure;


            maximumWind =
                Math.max(
                    maximumWind,
                    wind
                );


            maximumPrecipitation =
                Math.max(
                    maximumPrecipitation,
                    precip
                );


            maximumSnowfall =
                Math.max(
                    maximumSnowfall,
                    atmosphere.snowMmHr[
                        cell
                    ]
                );


            maximumSnowDepth =
                Math.max(
                    maximumSnowDepth,
                    atmosphere.snowDepthCm[
                        cell
                    ]
                );


            maximumFront =
                Math.max(
                    maximumFront,
                    atmosphere.frontStrength[
                        cell
                    ]
                );


            maximumLift =
                Math.max(
                    maximumLift,
                    atmosphere.totalLift[
                        cell
                    ]
                );


            if (
                precip >
                0.05
            ) {

                precipitatingCells++;
            }


            const phase =
                atmosphere.precipitationPhase[
                    cell
                ];


            if (
                phase ===
                PHASE.RAIN
            ) {

                rainCells++;
            }


            if (
                phase ===
                PHASE.SLEET
            ) {

                sleetCells++;
            }


            if (
                phase ===
                PHASE.WET_SNOW
            ) {

                wetSnowCells++;
            }


            if (
                phase ===
                PHASE.SNOW
            ) {

                snowCells++;
            }
        }


        return {

            date:
                this.date,


            physicsSteps:
                this.physicsSteps,


            simulatedMinutes:
                this.simulatedMinutes,


            revision:
                this.revision,


            temperature: {

                minimumC:
                    minimumTemperature,

                meanC:
                    temperatureSum /
                    n,

                maximumC:
                    maximumTemperature
            },


            pressure: {

                minimumHpa:
                    minimumPressure,

                meanHpa:
                    pressureSum /
                    n,

                maximumHpa:
                    maximumPressure
            },


            maximumWindMs:
                maximumWind,


            precipitation: {

                maximumMmHr:
                    maximumPrecipitation,

                precipitatingFraction:
                    precipitatingCells /
                    n,

                rainCells,

                sleetCells,

                wetSnowCells,

                snowCells
            },


            snow: {

                maximumSnowfallMmHr:
                    maximumSnowfall,

                maximumDepthCm:
                    maximumSnowDepth
            },


            strongestFront:
                maximumFront,


            maximumLift,


            activeAirMassRecords:
                this.airMasses.masses.length,


            activePressureSystems:
                this.synoptic.systems.length,


            steeringArrows:
                this.synoptic.arrows.length,


            stations:
                this.history.stations.size
        };
    }


    /* =================================================================
       VALIDATION
    ================================================================= */

    validate() {

        if (
            typeof this.terrain.validate ===
            "function"
        ) {

            this.terrain.validate();
        }


        if (
            typeof this.ocean.validate ===
            "function"
        ) {

            this.ocean.validate();
        }


        if (
            typeof this.atmosphere.validate ===
            "function"
        ) {

            this.atmosphere.validate();
        }


        if (
            this.physicsStepMinutes !==
            4
        ) {

            console.warn(
                "EuropaCraft V10 expected 4-minute physics; configured:",
                this.physicsStepMinutes
            );
        }


        return true;
    }


    /* =================================================================
       DIAGNOSTICS
    ================================================================= */

    diagnostics() {

        return {

            engine:
                this.C.engineName,


            version:
                this.C.version,


            date:
                this.date,


            physicsStepMinutes:
                this.physicsStepMinutes,


            physicsSteps:
                this.physicsSteps,


            simulatedMinutes:
                this.simulatedMinutes,


            queuedMinutes:
                this.queuedMinutes,


            paused:
                this.paused,


            terrainSource:
                this.terrain.source,


            grid: {

                nx:
                    this.terrain.nx,

                ny:
                    this.terrain.ny,

                cells:
                    this.terrain.n
            },


            levels:
                this.AtmosphereModule
                    .LEVEL_KEYS
                    .slice(),


            airMassTracerCount:
                this.AtmosphereModule
                    .TRACER_NAMES
                    .length,


            history:
                typeof this.history.memoryStats ===
                    "function"
                    ? this.history.memoryStats()
                    : null,


            statistics:
                this.statistics()
        };
    }
}


/* =====================================================================
   FACTORY
===================================================================== */

function createWeather(options = {}) {

    return new Weather(
        options
    );
}


/* =====================================================================
   EXPORT

   There are deliberately NO executable dependency checks before this.
===================================================================== */

global.EuropaWeather =
    Object.freeze({

        version:
            "10.0.1",

        Weather,

        createWeather
    });


})(window);
