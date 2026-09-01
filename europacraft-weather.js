/*
 * EuropaCraft Atmospheric Simulation
 * V10 Weather Orchestrator
 *
 * Responsibilities:
 *
 * - Construct the complete V10 atmospheric model.
 * - Own simulation date/time.
 * - Enforce the 4-minute primary physics timestep.
 * - Run repeated physical steps for accelerated playback.
 * - Connect:
 *
 *     terrain
 *     ocean
 *     atmosphere
 *     air masses
 *     synoptic systems
 *     microphysics
 *     physics
 *     history
 *     weather stations
 *
 * - Provide the public API used later by renderer/index.html.
 *
 *
 * CRITICAL RULE
 * ================================================================
 *
 * Fast playback NEVER increases the physical timestep.
 *
 * Example:
 *
 *   +60 simulated minutes
 *
 * becomes:
 *
 *   15 genuine 4-minute physics steps
 *
 * rather than one 60-minute physics calculation.
 *
 * This is essential for:
 *
 *   advection
 *   fronts
 *   convergence
 *   saturation
 *   cloud development
 *   precipitation
 *   precipitation phase transitions
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;

    const TerrainModule =
        global.EuropaTerrain;

    const OceanModule =
        global.EuropaOcean;

    const AtmosphereModule =
        global.EuropaAtmosphere;

    const AirMassModule =
        global.EuropaAirMasses;

    const SynopticModule =
        global.EuropaSynoptic;

    const MicrophysicsModule =
        global.EuropaMicrophysics;

    const PhysicsModule =
        global.EuropaPhysics;

    const HistoryModule =
        global.EuropaHistory;


    /* ================================================================
       DEPENDENCY CHECK
    ================================================================ */

    function requireDependency(
        dependency,
        filename
    ) {

        if (!dependency) {

            throw new Error(
                "EuropaCraft V10: " +
                filename +
                " must load before europacraft-weather.js"
            );
        }
    }


    requireDependency(
        C,
        "config.js"
    );

    requireDependency(
        U,
        "europacraft-utils.js"
    );

    requireDependency(
        TerrainModule,
        "europacraft-terrain.js"
    );

    requireDependency(
        OceanModule,
        "europacraft-ocean.js"
    );

    requireDependency(
        AtmosphereModule,
        "europacraft-atmosphere.js"
    );

    requireDependency(
        AirMassModule,
        "europacraft-airmasses.js"
    );

    requireDependency(
        SynopticModule,
        "europacraft-synoptic.js"
    );

    requireDependency(
        MicrophysicsModule,
        "europacraft-microphysics.js"
    );

    requireDependency(
        PhysicsModule,
        "europacraft-physics.js"
    );

    requireDependency(
        HistoryModule,
        "europacraft-history.js"
    );


    if (
        !global.EuropaClimate ||
        typeof global.EuropaClimate.getClimate !==
            "function"
    ) {

        throw new Error(
            "EuropaCraft V10: europacraft-climate-v3.js must load before europacraft-weather.js"
        );
    }


    /* ================================================================
       HELPERS
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

            return new Date(
                value.getTime()
            );
        }


        const date =
            new Date(value);


        if (
            Number.isFinite(
                date.getTime()
            )
        ) {

            return date;
        }


        return new Date();
    }


    function makeEvent(
        type,
        weather,
        extra = {}
    ) {

        return {

            type,

            date:
                new Date(
                    weather.currentDate.getTime()
                ),

            timeMs:
                weather.currentDate.getTime(),

            step:
                weather.physicsSteps,

            revision:
                weather.revision,

            ...extra
        };
    }


    /* ================================================================
       WEATHER ENGINE
    ================================================================ */

    class Weather {

        constructor(
            options = {}
        ) {

            /* ========================================================
               CLOCK
            ======================================================== */

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
                C.time.physicsStepMinutes;


            this.physicsSteps =
                0;


            this.simulatedMinutes =
                0;


            this.revision =
                0;


            this.paused =
                options.paused ===
                true;


            /*
             * Playback multiplier is only metadata for the UI.
             *
             * It does NOT modify the physics timestep.
             */

            this.playbackMinutesPerTick =
                Math.max(
                    this.physicsStepMinutes,
                    finite(
                        options.playbackMinutesPerTick,
                        60
                    )
                );


            /* ========================================================
               EVENT LISTENERS
            ======================================================== */

            this.listeners =
                new Map();


            /* ========================================================
               TERRAIN
            ======================================================== */

            this.terrain =
                options.terrain ||
                new TerrainModule.Terrain(
                    options.terrainOptions ||
                    {}
                );


            /* ========================================================
               OCEAN
            ======================================================== */

            this.ocean =
                options.ocean ||
                new OceanModule.Ocean(
                    this.terrain,
                    this.currentDate
                );


            /* ========================================================
               ATMOSPHERE
            ======================================================== */

            this.atmosphere =
                options.atmosphere ||
                new AtmosphereModule.Atmosphere(
                    this.terrain,
                    this.ocean,
                    this.currentDate
                );


            /* ========================================================
               SYNOPTIC ENGINE
            ======================================================== */

            this.synoptic =
                options.synoptic ||
                new SynopticModule.Synoptic(
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


            /* ========================================================
               AIR-MASS ENGINE
            ======================================================== */

            this.airMasses =
                options.airMasses ||
                new AirMassModule.AirMassManager(
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


            /* ========================================================
               MICROPHYSICS
            ======================================================== */

            this.microphysics =
                options.microphysics ||
                new MicrophysicsModule.Microphysics(
                    this.terrain,
                    this.ocean,
                    this.atmosphere
                );


            /* ========================================================
               CORE PHYSICS
            ======================================================== */

            this.physics =
                options.physics ||
                new PhysicsModule.Physics(
                    this.terrain,
                    this.ocean,
                    this.atmosphere,
                    this.synoptic,
                    this.airMasses,
                    this.microphysics
                );


            /* ========================================================
               HISTORY
            ======================================================== */

            this.history =
                options.history ||
                new HistoryModule.History(
                    this.terrain,
                    this.ocean,
                    this.atmosphere,
                    this.synoptic,
                    this.airMasses,
                    options.historyOptions ||
                    {}
                );


            /* ========================================================
               FRAME ADVANCE QUEUE
            ======================================================== */

            /*
             * The UI may request more simulation work than should be
             * executed in one browser frame.
             *
             * queuedMinutes can be drained across multiple frames while
             * every physical step remains <= 4 minutes.
             */

            this.queuedMinutes =
                0;


            /* ========================================================
               AUTO-SYNOPTIC MAINTENANCE
            ======================================================== */

            /*
             * Off by default during the initial development/testing phase.
             *
             * Later calibration can enable automatic generation of new
             * Atlantic lows/ridges after existing systems decay.
             */

            this.autoSynoptic =
                options.autoSynoptic ===
                true;


            this.lastSynopticMaintenanceMs =
                this.currentDate.getTime();


            /* ========================================================
               INITIAL HISTORY STATE
            ======================================================== */

            this.history.captureSnapshot(
                this.currentDate,
                true
            );


            /* ========================================================
               VALIDATION
            ======================================================== */

            this.validate();


            this.emit(
                "initialized",
                makeEvent(
                    "initialized",
                    this
                )
            );
        }


        /* ============================================================
           EVENT SYSTEM
        ============================================================ */

        on(
            eventName,
            callback
        ) {

            if (
                typeof callback !==
                "function"
            ) {
                return () => {};
            }


            if (
                !this.listeners.has(
                    eventName
                )
            ) {

                this.listeners.set(
                    eventName,
                    new Set()
                );
            }


            const listeners =
                this.listeners.get(
                    eventName
                );


            listeners.add(
                callback
            );


            return () => {

                listeners.delete(
                    callback
                );
            };
        }


        off(
            eventName,
            callback
        ) {

            const listeners =
                this.listeners.get(
                    eventName
                );


            if (!listeners) {
                return false;
            }


            return listeners.delete(
                callback
            );
        }


        emit(
            eventName,
            payload
        ) {

            const listeners =
                this.listeners.get(
                    eventName
                );


            if (!listeners) {
                return;
            }


            for (
                const callback of listeners
            ) {

                try {

                    callback(
                        payload
                    );
                }
                catch (error) {

                    console.error(
                        "EuropaCraft V10 event listener failed:",
                        eventName,
                        error
                    );
                }
            }
        }


        /* ============================================================
           CLOCK
        ============================================================ */

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


            this.emit(
                "playback",
                makeEvent(
                    "playback",
                    this,
                    {
                        paused:
                            false
                    }
                )
            );
        }


        pause() {

            this.paused =
                true;


            this.emit(
                "playback",
                makeEvent(
                    "playback",
                    this,
                    {
                        paused:
                            true
                    }
                )
            );
        }


        togglePause() {

            if (
                this.paused
            ) {
                this.play();
            }
            else {
                this.pause();
            }


            return this.paused;
        }


        setPlaybackMinutesPerTick(
            minutes
        ) {

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


        /* ============================================================
           EXACT PHYSICS STEP
        ============================================================ */

        _physicsStep(
            minutes = this.physicsStepMinutes,
            recordHistory = true
        ) {

            const stepMinutes =
                U.clamp(
                    finite(
                        minutes,
                        this.physicsStepMinutes
                    ),
                    0.0001,
                    this.physicsStepMinutes
                );


            const nextDate =
                new Date(
                    this.currentDate.getTime() +
                    stepMinutes *
                    60000
                );


            /*
             * Physics receives the END time of this timestep.
             *
             * This means radiation, seasonal ocean state and other
             * date-dependent calculations correspond to the atmosphere
             * being produced at nextDate.
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
                recordHistory
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


        /* ============================================================
           ADVANCE SIMULATION
        ============================================================ */

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


            if (
                remaining <=
                0
            ) {

                return {

                    requestedMinutes:
                        0,

                    advancedMinutes:
                        0,

                    physicsSteps:
                        0,

                    date:
                        this.date
                };
            }


            const recordHistory =
                options.recordHistory !==
                false;


            const startingSteps =
                this.physicsSteps;


            const startingTime =
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


            const advanced =
                (
                    this.currentDate.getTime() -
                    startingTime
                ) /
                60000;


            const steps =
                this.physicsSteps -
                startingSteps;


            this.emit(
                "advanced",
                makeEvent(
                    "advanced",
                    this,
                    {

                        advancedMinutes:
                            advanced,

                        physicsSteps:
                            steps
                    }
                )
            );


            return {

                requestedMinutes:
                    minutes,

                advancedMinutes:
                    advanced,

                physicsSteps:
                    steps,

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


        /* ============================================================
           SINGLE NORMAL TIMESTEP
        ============================================================ */

        step() {

            return this.advanceMinutes(
                this.physicsStepMinutes
            );
        }


        /* ============================================================
           PLAYBACK TICK
        ============================================================ */

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


        /* ============================================================
           FRAME-BUDGETED PLAYBACK
        ============================================================ */

        queueAdvance(
            minutes
        ) {

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


        queuePlaybackTick() {

            if (
                !this.paused
            ) {

                this.queueAdvance(
                    this.playbackMinutesPerTick
                );
            }


            return this.queuedMinutes;
        }


        processQueuedFrame(
            maxSteps =
                C.time.maxStepsPerFrame
        ) {

            const stepLimit =
                Math.max(
                    1,
                    Math.floor(
                        finite(
                            maxSteps,
                            C.time.maxStepsPerFrame
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

                const minutes =
                    Math.min(
                        this.physicsStepMinutes,
                        this.queuedMinutes
                    );


                this._physicsStep(
                    minutes,
                    true
                );


                this.queuedMinutes -=
                    minutes;


                advancedMinutes +=
                    minutes;


                steps++;
            }


            if (
                this.queuedMinutes <
                1e-9
            ) {

                this.queuedMinutes =
                    0;
            }


            if (
                steps >
                0
            ) {

                this.emit(
                    "frameAdvanced",
                    makeEvent(
                        "frameAdvanced",
                        this,
                        {

                            advancedMinutes,

                            physicsSteps:
                                steps,

                            queuedMinutesRemaining:
                                this.queuedMinutes
                        }
                    )
                );
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


        clearAdvanceQueue() {

            this.queuedMinutes =
                0;
        }


        /* ============================================================
           AIR MASSES
        ============================================================ */

        createAirMass(
            options = {}
        ) {

            const mass =
                this.airMasses.create({

                    ...options,

                    date:
                        this.currentDate
                });


            this.revision++;


            this.emit(
                "airMassCreated",
                makeEvent(
                    "airMassCreated",
                    this,
                    {

                        airMass:
                            this.airMasses.describe(
                                mass
                            )
                    }
                )
            );


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


        createCollisionTest(
            options = {}
        ) {

            /*
             * Deliberately contrasting test case.
             *
             * The air-mass module injects the physical air.
             *
             * No cloud or precipitation is injected here.
             */

            const pair =
                this.airMasses.createCollisionPair({

                    ...options,

                    date:
                        this.currentDate
                });


            this.revision++;


            this.emit(
                "collisionTestCreated",
                makeEvent(
                    "collisionTestCreated",
                    this,
                    {

                        western:
                            this.airMasses.describe(
                                pair.western
                            ),

                        eastern:
                            this.airMasses.describe(
                                pair.eastern
                            )
                    }
                )
            );


            return pair;
        }


        listAirMasses() {

            return this.airMasses.list();
        }


        clearAirMassRecords() {

            /*
             * This removes only source/injection records.
             *
             * Air already inserted into the prognostic atmosphere remains.
             */

            this.airMasses.clear();


            this.emit(
                "airMassRecordsCleared",
                makeEvent(
                    "airMassRecordsCleared",
                    this
                )
            );
        }


        /* ============================================================
           SYNOPTIC SYSTEMS
        ============================================================ */

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


            this.emit(
                "synopticChanged",
                makeEvent(
                    "synopticChanged",
                    this,
                    {

                        action:
                            "add-low",

                        system:
                            this.synoptic.describeSystem(
                                system
                            )
                    }
                )
            );


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


            this.emit(
                "synopticChanged",
                makeEvent(
                    "synopticChanged",
                    this,
                    {

                        action:
                            "add-high",

                        system:
                            this.synoptic.describeSystem(
                                system
                            )
                    }
                )
            );


            return system;
        }


        removePressureSystem(
            id
        ) {

            const removed =
                this.synoptic.removeSystem(
                    id
                );


            if (
                removed
            ) {

                this.emit(
                    "synopticChanged",
                    makeEvent(
                        "synopticChanged",
                        this,
                        {

                            action:
                                "remove-system",

                            id
                        }
                    )
                );
            }


            return removed;
        }


        clearPressureSystems() {

            this.synoptic.clearSystems();


            this.emit(
                "synopticChanged",
                makeEvent(
                    "synopticChanged",
                    this,
                    {

                        action:
                            "clear-systems"
                    }
                )
            );
        }


        listPressureSystems() {

            return this.synoptic.listSystems();
        }


        /* ============================================================
           STEERING FLOW
        ============================================================ */

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


            this.emit(
                "steeringChanged",
                makeEvent(
                    "steeringChanged",
                    this,
                    {

                        action:
                            "add",

                        arrow:
                            this.synoptic.describeArrow(
                                arrow
                            )
                    }
                )
            );


            return arrow;
        }


        removeSteeringArrow(
            id
        ) {

            const removed =
                this.synoptic.removeArrow(
                    id
                );


            if (
                removed
            ) {

                this.emit(
                    "steeringChanged",
                    makeEvent(
                        "steeringChanged",
                        this,
                        {

                            action:
                                "remove",

                            id
                        }
                    )
                );
            }


            return removed;
        }


        clearSteeringArrows() {

            this.synoptic.clearArrows();


            this.emit(
                "steeringChanged",
                makeEvent(
                    "steeringChanged",
                    this,
                    {

                        action:
                            "clear"
                    }
                )
            );
        }


        listSteeringArrows() {

            return this.synoptic.listArrows();
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
                this.history.addStation(
                    latitude,
                    longitude,
                    options
                );


            /*
             * Give a newly created station an immediate initial reading.
             */

            this.history.sampleStation(
                station,
                this.currentDate,
                true
            );


            this.emit(
                "stationChanged",
                makeEvent(
                    "stationChanged",
                    this,
                    {

                        action:
                            "add",

                        stationId:
                            station.id
                    }
                )
            );


            return station;
        }


        removeStation(
            id
        ) {

            const removed =
                this.history.removeStation(
                    id
                );


            if (
                removed
            ) {

                this.emit(
                    "stationChanged",
                    makeEvent(
                        "stationChanged",
                        this,
                        {

                            action:
                                "remove",

                            stationId:
                                id
                        }
                    )
                );
            }


            return removed;
        }


        getStation(
            id
        ) {

            return this.history.getStation(
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


        /* ============================================================
           SAMPLING
        ============================================================ */

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

            return this.ocean.diagnosticsAt(
                latitude,
                longitude
            );
        }


        microphysicsAt(
            latitude,
            longitude
        ) {

            return this.microphysics.diagnosticsAt(
                latitude,
                longitude
            );
        }


        precipitationDiagnosisAt(
            latitude,
            longitude
        ) {

            return this.physics.precipitationDiagnosisAt(
                latitude,
                longitude
            );
        }


        /* ============================================================
           REWIND
        ============================================================ */

        restoreSnapshot(
            snapshot
        ) {

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
                restoredDate;


            this.queuedMinutes =
                0;


            this.revision++;


            this.emit(
                "rewound",
                makeEvent(
                    "rewound",
                    this,
                    {

                        restoredDate:
                            this.date
                    }
                )
            );


            return this.date;
        }


        rewindHours(
            hours
        ) {

            const targetDate =
                new Date(
                    this.currentDate.getTime() -
                    Math.max(
                        0,
                        finite(
                            hours,
                            0
                        )
                    ) *
                    3600000
                );


            const snapshot =
                this.history.nearestSnapshot(
                    targetDate,
                    true
                );


            if (
                !snapshot
            ) {
                return null;
            }


            this.restoreSnapshot(
                snapshot
            );


            /*
             * If the snapshot predates the exact requested target, replay
             * forward physically to the requested instant.
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


            this.emit(
                "rewoundExact",
                makeEvent(
                    "rewoundExact",
                    this,
                    {

                        targetDate:
                            new Date(
                                targetDate.getTime()
                            )
                    }
                )
            );


            return this.date;
        }


        /* ============================================================
           SYNOPTIC MAINTENANCE
        ============================================================ */

        maintainSynopticEnvironment() {

            /*
             * This is deliberately conservative and OFF by default.
             *
             * Once long-duration calibration begins, enabling it prevents
             * the initial systems from eventually leaving the domain and
             * producing an unrealistically quiet atmosphere forever.
             */

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
                        system.kind ===
                            "low" &&
                        system.enabled
                );


            const activeHighs =
                this.synoptic.systems.filter(
                    system =>
                        system.kind ===
                            "high" &&
                        system.enabled
                );


            /*
             * Maintain a broad North Atlantic storm track.
             */

            if (
                activeLows.length <
                1
            ) {

                this.synoptic.addLow(
                    54 +
                        Math.sin(
                            this.currentDate.getTime() /
                            86400000
                        ) *
                        4,

                    -22,

                    986 +
                        Math.sin(
                            this.currentDate.getTime() /
                            172800000
                        ) *
                        6,

                    {

                        name:
                            "Atlantic Cyclone",

                        radiusKm:
                            1000,

                        strength:
                            0.82,

                        bearingDeg:
                            70,

                        speedKmh:
                            34,

                        developmentHours:
                            18,

                        matureHours:
                            40,

                        fillingHours:
                            54
                    }
                );
            }


            /*
             * Preserve at least one broad anticyclonic influence.
             */

            if (
                activeHighs.length <
                1
            ) {

                this.synoptic.addHigh(
                    39,
                    -14,
                    1027,
                    {

                        name:
                            "Atlantic Ridge",

                        radiusKm:
                            1400,

                        strength:
                            0.65,

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


        setAutoSynoptic(
            enabled
        ) {

            this.autoSynoptic =
                !!enabled;


            return this.autoSynoptic;
        }


        /* ============================================================
           COLLISION DEVELOPMENT TEST
        ============================================================ */

        runCollisionDevelopmentTest(
            options = {}
        ) {

            /*
             * Programmatic development helper.
             *
             * Later the UI will expose this as a controlled test.
             *
             * This creates the air masses, then runs ACTUAL physics.
             */

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


        /* ============================================================
           DOMAIN STATISTICS
        ============================================================ */

        statistics() {

            const a =
                this.atmosphere;


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


            for (
                let cell = 0;
                cell < this.terrain.n;
                cell++
            ) {

                const temperature =
                    a.surface.tempC[
                        cell
                    ];


                const pressure =
                    a.pressureHpa[
                        cell
                    ];


                const wind =
                    Math.hypot(
                        a.surface.u[
                            cell
                        ],
                        a.surface.v[
                            cell
                        ]
                    );


                const precipitation =
                    a.precipMmHr[
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
                        precipitation
                    );


                maximumSnowfall =
                    Math.max(
                        maximumSnowfall,
                        a.snowMmHr[
                            cell
                        ]
                    );


                maximumSnowDepth =
                    Math.max(
                        maximumSnowDepth,
                        a.snowDepthCm[
                            cell
                        ]
                    );


                maximumFront =
                    Math.max(
                        maximumFront,
                        a.frontStrength[
                            cell
                        ]
                    );


                maximumLift =
                    Math.max(
                        maximumLift,
                        a.totalLift[
                            cell
                        ]
                    );


                if (
                    precipitation >
                    0.05
                ) {
                    precipitatingCells++;
                }


                switch (
                    a.precipitationPhase[
                        cell
                    ]
                ) {

                    case AtmosphereModule
                        .PRECIPITATION_PHASE
                        .RAIN:

                        rainCells++;
                        break;


                    case AtmosphereModule
                        .PRECIPITATION_PHASE
                        .SLEET:

                        sleetCells++;
                        break;


                    case AtmosphereModule
                        .PRECIPITATION_PHASE
                        .WET_SNOW:

                        wetSnowCells++;
                        break;


                    case AtmosphereModule
                        .PRECIPITATION_PHASE
                        .SNOW:

                        snowCells++;
                        break;
                }
            }


            const n =
                this.terrain.n;


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


        /* ============================================================
           VALIDATION
        ============================================================ */

        validate() {

            this.terrain.validate();

            this.ocean.validate();

            this.atmosphere.validate();


            if (
                this.physicsStepMinutes !==
                4
            ) {

                console.warn(
                    "EuropaCraft V10 expected a 4-minute primary physics timestep but configuration currently specifies:",
                    this.physicsStepMinutes
                );
            }


            return true;
        }


        /* ============================================================
           DEVELOPMENT DIAGNOSTICS
        ============================================================ */

        diagnostics() {

            return {

                engine:
                    C.engineName,

                version:
                    C.version,

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

                playbackMinutesPerTick:
                    this.playbackMinutesPerTick,

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
                    AtmosphereModule
                        .LEVEL_KEYS
                        .slice(),

                airMassTracerCount:
                    AtmosphereModule
                        .TRACER_NAMES
                        .length,

                history:
                    this.history.memoryStats(),

                statistics:
                    this.statistics()
            };
        }
    }


    /* ================================================================
       FACTORY
    ================================================================ */

    function createWeather(
        options = {}
    ) {

        return new Weather(
            options
        );
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaWeather =
        Object.freeze({

            Weather,

            createWeather
        });

})(window);
