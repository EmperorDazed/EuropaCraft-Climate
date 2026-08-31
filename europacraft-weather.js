/* ============================================================================
   EuropaCraft Weather Simulator
   Main Weather Simulation Controller
   Version 7.2

   NEW FILE

   This replaces the OLD:
       europacraft-weather-v1.js

   PURPOSE

   This file connects the complete weather simulation stack:

       EuropaTerrain
       EuropaOcean
       EuropaSynoptic
       EuropaAtmosphere
       EuropaPhysics
       EuropaHistory

   It manages:

       - simulation creation
       - current simulation date/time
       - 4-minute physics stepping
       - play / pause
       - simulation speed
       - manual stepping
       - forward simulation
       - backward timeline seeking
       - snapshot restoration
       - station management
       - steering arrows
       - synoptic systems
       - renderer/event notifications
       - safe simulation state access

   IMPORTANT ARCHITECTURE RULE

   The controller does NOT generate weather.

   It tells the physics engine to advance the persistent atmosphere.

   Likewise, temperature anomaly is not generated here.

   It remains:

       actual simulated temperature
       -
       climatological temperature
       =
       anomaly diagnostic

============================================================================ */

(function (global) {
"use strict";


const C = global.EuropaConfig;
const U = global.EuropaUtils;


/* ============================================================================
   BASIC HELPERS
============================================================================ */

function asDate(
    value
) {

    if (
        value instanceof Date
    ) {

        return new Date(
            value.getTime()
        );
    }


    return new Date(
        value
    );
}


function validDate(
    date
) {

    return (
        date instanceof Date &&
        Number.isFinite(
            date.getTime()
        )
    );
}


function clampNumber(
    value,
    minimum,
    maximum,
    fallback
) {

    value = Number(
        value
    );


    if (
        !Number.isFinite(
            value
        )
    ) {

        return fallback;
    }


    return U.clamp(
        value,
        minimum,
        maximum
    );
}


function physicsStepMinutes() {

    const configured = Number(
        C.grid.physicsStepMinutes
    );


    return (
        Number.isFinite(
            configured
        ) &&
        configured > 0

            ? configured

            : 4
    );
}


/* ============================================================================
   SMALL EVENT SYSTEM

   The renderer will subscribe to these events later.

   Examples:

       weather.on("step", ...)
       weather.on("seek", ...)
       weather.on("play", ...)
       weather.on("pause", ...)
============================================================================ */

class EventBus {

    constructor() {

        this.listeners = (
            new Map()
        );
    }


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


        this.listeners.get(
            eventName
        ).add(
            callback
        );


        return () => {

            this.off(
                eventName,
                callback
            );
        };
    }


    off(
        eventName,
        callback
    ) {

        const group = (
            this.listeners.get(
                eventName
            )
        );


        if (
            !group
        ) {

            return;
        }


        group.delete(
            callback
        );


        if (
            group.size === 0
        ) {

            this.listeners.delete(
                eventName
            );
        }
    }


    emit(
        eventName,
        detail
    ) {

        const group = (
            this.listeners.get(
                eventName
            )
        );


        if (
            group
        ) {

            for (
                const callback
                of group
            ) {

                try {

                    callback(
                        detail
                    );
                }

                catch (
                    error
                ) {

                    console.error(
                        "EuropaWeather event listener failed:",
                        eventName,
                        error
                    );
                }
            }
        }


        /*
         * Also provide normal browser events so independent UI modules can
         * listen without owning the WeatherController instance directly.
         */

        if (
            typeof global.dispatchEvent ===
            "function" &&
            typeof global.CustomEvent ===
            "function"
        ) {

            try {

                global.dispatchEvent(

                    new CustomEvent(

                        "europaweather:" +
                        eventName,

                        {
                            detail
                        }
                    )
                );
            }

            catch (
                error
            ) {

                /*
                 * CustomEvent support is optional.
                 */
            }
        }
    }


    clear() {

        this.listeners.clear();
    }
}


/* ============================================================================
   WEATHER CONTROLLER
============================================================================ */

class WeatherController {

    constructor(
        options = {}
    ) {

        /* ====================================================================
           VERIFY MODULES
           ==================================================================== */

        this._verifyModules();


        /* ====================================================================
           SIMULATION DATE

           The caller may set an explicit start date.

           Otherwise use current date/time.
           ==================================================================== */

        const startDate = (
            options.startDate !== undefined
                ? asDate(
                    options.startDate
                )
                : new Date()
        );


        if (
            !validDate(
                startDate
            )
        ) {

            throw new Error(
                "EuropaWeather: invalid simulation start date."
            );
        }


        this.currentDate = (
            startDate
        );


        this.initialDate = (
            new Date(
                startDate.getTime()
            )
        );


        /* ====================================================================
           RANDOM / SYNOPTIC SEED
           ==================================================================== */

        this.seed = (
            Number.isFinite(
                Number(
                    options.seed
                )
            )
                ? Number(
                    options.seed
                )
                : 20261001
        );


        /* ====================================================================
           EVENT BUS
           ==================================================================== */

        this.events = (
            new EventBus()
        );


        /* ====================================================================
           CREATE MODEL COMPONENTS
           ==================================================================== */

        this.terrain = (
            options.terrain ||
            new global.EuropaTerrain()
        );


        this.ocean = (
            options.ocean ||
            new global.EuropaOcean.Ocean(

                this.terrain,

                this.currentDate
            )
        );


        this.synoptic = (
            options.synoptic ||
            new global.EuropaSynoptic(

                this.terrain,

                this.seed
            )
        );


        this.atmosphere = (
            options.atmosphere ||
            new global.EuropaAtmosphere(

                this.terrain,

                this.ocean,

                this.synoptic,

                this.currentDate
            )
        );


        this.physics = (
            options.physics ||
            new global.EuropaPhysics(

                this.terrain,

                this.ocean,

                this.synoptic,

                this.atmosphere
            )
        );


        this.history = (
            options.history ||
            new global.EuropaHistory(

                this.atmosphere,

                this.ocean,

                this.synoptic,

                this.terrain
            )
        );


        /* ====================================================================
           PLAYBACK
           ==================================================================== */

        this.playing = false;


        /*
         * Simulation speed is expressed as:
         *
         *     simulated seconds / real second
         *
         * Examples:
         *
         *       1 = real-time
         *      60 = 1 simulated minute per real second
         *     600 = 10 simulated minutes per real second
         *    3600 = 1 simulated hour per real second
         */

        this.timeScale = clampNumber(

            options.timeScale !== undefined
                ? options.timeScale
                : 60,

            0.01,

            100000,

            60
        );


        /*
         * Accumulator contains simulated milliseconds waiting to be processed.
         */

        this.simulationAccumulatorMs = 0;


        /*
         * Protect browser responsiveness during accelerated playback.
         */

        this.maxPhysicsStepsPerFrame = clampNumber(

            options.maxPhysicsStepsPerFrame !== undefined
                ? options.maxPhysicsStepsPerFrame
                : 24,

            1,

            500,

            24
        );


        /*
         * requestAnimationFrame state.
         */

        this._animationFrame = null;

        this._lastRealFrameTime = null;


        /* ====================================================================
           STATE
           ==================================================================== */

        this.totalPhysicsSteps = 0;

        this.busy = false;

        this.destroyed = false;


        /* ====================================================================
           SAVE INITIAL SNAPSHOT
           ==================================================================== */

        this.history.record(

            this.currentDate,

            true
        );


        this.events.emit(

            "ready",

            this.getStateSummary()
        );
    }


    /* ========================================================================
       MODULE VERIFICATION
       ======================================================================== */

    _verifyModules() {

        const missing = [];


        if (
            !global.EuropaConfig
        ) {

            missing.push(
                "europacraft-config.js"
            );
        }


        if (
            !global.EuropaUtils
        ) {

            missing.push(
                "europacraft-utils.js"
            );
        }


        if (
            !global.EuropaTerrain
        ) {

            missing.push(
                "europacraft-terrain.js"
            );
        }


        if (
            !global.EuropaClimate
        ) {

            missing.push(
                "europacraft-climate.js"
            );
        }


        if (
            !global.EuropaOcean ||
            !global.EuropaOcean.Ocean
        ) {

            missing.push(
                "europacraft-ocean.js"
            );
        }


        if (
            !global.EuropaSynoptic
        ) {

            missing.push(
                "europacraft-synoptic.js"
            );
        }


        if (
            !global.EuropaAtmosphere
        ) {

            missing.push(
                "europacraft-atmosphere.js"
            );
        }


        if (
            !global.EuropaPhysics
        ) {

            missing.push(
                "europacraft-physics.js"
            );
        }


        if (
            !global.EuropaHistory
        ) {

            missing.push(
                "europacraft-history.js"
            );
        }


        if (
            missing.length > 0
        ) {

            throw new Error(

                "EuropaWeather cannot start. Missing modules: " +
                missing.join(
                    ", "
                )
            );
        }
    }


    /* ========================================================================
       CURRENT TIME
       ======================================================================== */

    getDate() {

        return new Date(
            this.currentDate.getTime()
        );
    }


    getTimeMs() {

        return (
            this.currentDate.getTime()
        );
    }


    getPhysicsStepMinutes() {

        return (
            physicsStepMinutes()
        );
    }


    /* ========================================================================
       ONE PHYSICS STEP
       ======================================================================== */

    step(
        minutes = null,
        options = {}
    ) {

        if (
            this.destroyed
        ) {

            return false;
        }


        if (
            this.busy
        ) {

            return false;
        }


        const stepMinutes = (

            minutes === null ||
            minutes === undefined

                ? physicsStepMinutes()

                : Number(
                    minutes
                )
        );


        if (
            !Number.isFinite(
                stepMinutes
            ) ||
            stepMinutes <= 0
        ) {

            return false;
        }


        this.busy = true;


        try {

            const nextDate = (
                new Date(

                    this.currentDate.getTime() +

                    stepMinutes *
                    60 *
                    1000
                )
            );


            /*
             * Physics receives the END timestamp for this timestep.
             */

            this.physics.step(

                nextDate,

                stepMinutes
            );


            this.currentDate = (
                nextDate
            );


            this.totalPhysicsSteps++;


            if (
                options.recordHistory !==
                false
            ) {

                this.history.record(
                    this.currentDate
                );
            }


            if (
                options.emitEvent !==
                false
            ) {

                this.events.emit(

                    "step",

                    this.getStateSummary()
                );
            }


            return true;
        }

        finally {

            this.busy = false;
        }
    }


    /* ========================================================================
       STEP FORWARD BY EXACT NUMBER OF MINUTES

       Normal integration uses the configured 4-minute timestep.

       A final shorter timestep can be used when an exact arbitrary target
       minute is requested.

       Example:

           current 18:32
           target  18:43

       runs:

           +4
           +4
           +3

       Regular playback remains 4-minute physics.
       ======================================================================== */

    advanceMinutes(
        requestedMinutes,
        options = {}
    ) {

        const minutes = (
            Number(
                requestedMinutes
            )
        );


        if (
            !Number.isFinite(
                minutes
            ) ||
            minutes <= 0
        ) {

            return 0;
        }


        const standardStep = (
            physicsStepMinutes()
        );


        let remaining = (
            minutes
        );


        let steps = 0;


        while (
            remaining >
            0.000001
        ) {

            const amount = Math.min(

                standardStep,

                remaining
            );


            const success = (
                this.step(
                    amount,
                    {
                        recordHistory:
                            options.recordHistory !== false,

                        emitEvent:
                            false
                    }
                )
            );


            if (
                !success
            ) {

                break;
            }


            remaining -= (
                amount
            );


            steps++;


            if (
                Number.isFinite(
                    options.maximumSteps
                ) &&
                steps >=
                options.maximumSteps
            ) {

                break;
            }
        }


        if (
            options.emitEvent !==
            false
        ) {

            this.events.emit(

                "advance",

                {
                    minutesAdvanced:
                        minutes -
                        Math.max(
                            0,
                            remaining
                        ),

                    physicsSteps:
                        steps,

                    state:
                        this.getStateSummary()
                }
            );
        }


        return (
            minutes -
            Math.max(
                0,
                remaining
            )
        );
    }


    /* ========================================================================
       ADVANCE HOURS
       ======================================================================== */

    advanceHours(
        hours,
        options = {}
    ) {

        return this.advanceMinutes(

            Number(
                hours
            ) *
            60,

            options
        );
    }


    /* ========================================================================
       ADVANCE DAYS
       ======================================================================== */

    advanceDays(
        days,
        options = {}
    ) {

        return this.advanceMinutes(

            Number(
                days
            ) *
            24 *
            60,

            options
        );
    }


    /* ========================================================================
       PLAY
       ======================================================================== */

    play() {

        if (
            this.destroyed ||
            this.playing
        ) {

            return;
        }


        this.playing = true;

        this._lastRealFrameTime = null;


        this.events.emit(

            "play",

            this.getStateSummary()
        );


        this._requestNextFrame();
    }


    /* ========================================================================
       PAUSE
       ======================================================================== */

    pause() {

        if (
            !this.playing
        ) {

            return;
        }


        this.playing = false;


        if (
            this._animationFrame !==
            null &&
            typeof global.cancelAnimationFrame ===
            "function"
        ) {

            global.cancelAnimationFrame(
                this._animationFrame
            );
        }


        this._animationFrame = null;

        this._lastRealFrameTime = null;


        this.events.emit(

            "pause",

            this.getStateSummary()
        );
    }


    /* ========================================================================
       TOGGLE
       ======================================================================== */

    togglePlay() {

        if (
            this.playing
        ) {

            this.pause();
        }

        else {

            this.play();
        }


        return (
            this.playing
        );
    }


    /* ========================================================================
       SET SIMULATION SPEED
       ======================================================================== */

    setTimeScale(
        simulatedSecondsPerRealSecond
    ) {

        this.timeScale = clampNumber(

            simulatedSecondsPerRealSecond,

            0.01,

            100000,

            this.timeScale
        );


        this.events.emit(

            "speed",

            {
                timeScale:
                    this.timeScale,

                state:
                    this.getStateSummary()
            }
        );


        return (
            this.timeScale
        );
    }


    getTimeScale() {

        return (
            this.timeScale
        );
    }


    /* ========================================================================
       PRESET PLAYBACK SPEEDS
       ======================================================================== */

    setRealtimeSpeed() {

        return this.setTimeScale(
            1
        );
    }


    setOneMinutePerSecond() {

        return this.setTimeScale(
            60
        );
    }


    setTenMinutesPerSecond() {

        return this.setTimeScale(
            600
        );
    }


    setOneHourPerSecond() {

        return this.setTimeScale(
            3600
        );
    }


    setSixHoursPerSecond() {

        return this.setTimeScale(
            21600
        );
    }


    setOneDayPerSecond() {

        return this.setTimeScale(
            86400
        );
    }


    /* ========================================================================
       ANIMATION FRAME
       ======================================================================== */

    _requestNextFrame() {

        if (
            !this.playing ||
            this.destroyed
        ) {

            return;
        }


        if (
            typeof global.requestAnimationFrame !==
            "function"
        ) {

            /*
             * Browser fallback.
             */

            this._animationFrame = global.setTimeout(

                () => {

                    this._animationLoop(
                        performance.now()
                    );

                },

                16
            );


            return;
        }


        this._animationFrame = global.requestAnimationFrame(

            timestamp => {

                this._animationLoop(
                    timestamp
                );
            }
        );
    }


    _animationLoop(
        realTimestamp
    ) {

        if (
            !this.playing ||
            this.destroyed
        ) {

            return;
        }


        if (
            this._lastRealFrameTime ===
            null
        ) {

            this._lastRealFrameTime = (
                realTimestamp
            );


            this._requestNextFrame();

            return;
        }


        let realElapsedMs = (

            realTimestamp -
            this._lastRealFrameTime
        );


        this._lastRealFrameTime = (
            realTimestamp
        );


        /*
         * Prevent one inactive browser tab frame from trying to simulate weeks
         * instantly.
         */

        realElapsedMs = U.clamp(

            realElapsedMs,

            0,

            1000
        );


        const simulatedElapsedMs = (

            realElapsedMs *
            this.timeScale
        );


        this.simulationAccumulatorMs += (
            simulatedElapsedMs
        );


        const standardStepMs = (

            physicsStepMinutes() *
            60 *
            1000
        );


        let stepsThisFrame = 0;


        while (
            this.simulationAccumulatorMs >=
            standardStepMs &&
            stepsThisFrame <
            this.maxPhysicsStepsPerFrame
        ) {

            this.step(

                physicsStepMinutes(),

                {
                    emitEvent:
                        false
                }
            );


            this.simulationAccumulatorMs -= (
                standardStepMs
            );


            stepsThisFrame++;
        }


        /*
         * If playback becomes too fast for the browser we do not discard the
         * accumulated simulation time.

         * It remains in the accumulator and the model catches up over future
         * frames.
         */


        if (
            stepsThisFrame > 0
        ) {

            this.events.emit(

                "frame",

                {
                    physicsSteps:
                        stepsThisFrame,

                    state:
                        this.getStateSummary()
                }
            );
        }


        this._requestNextFrame();
    }


    /* ========================================================================
       SEEK / TIMELINE

       Forward seek:
           simply integrates forward.

       Backward seek:
           restore latest snapshot at or before target,
           then integrate forward again.

       The atmosphere is never integrated backwards.
       ======================================================================== */

    seek(
        targetDateInput,
        options = {}
    ) {

        const targetDate = (
            asDate(
                targetDateInput
            )
        );


        if (
            !validDate(
                targetDate
            )
        ) {

            throw new Error(
                "EuropaWeather.seek(): invalid target date."
            );
        }


        const wasPlaying = (
            this.playing
        );


        if (
            wasPlaying
        ) {

            this.pause();
        }


        const currentMs = (
            this.currentDate.getTime()
        );


        const targetMs = (
            targetDate.getTime()
        );


        if (
            targetMs ===
            currentMs
        ) {

            if (
                wasPlaying &&
                options.resume !== false
            ) {

                this.play();
            }


            return (
                this.getDate()
            );
        }


        /* ====================================================================
           FORWARD
           ==================================================================== */

        if (
            targetMs >
            currentMs
        ) {

            const differenceMinutes = (

                targetMs -
                currentMs

            ) /
            60000;


            this.advanceMinutes(

                differenceMinutes,

                {
                    emitEvent:
                        false
                }
            );


            this.events.emit(

                "seek",

                {
                    direction:
                        "forward",

                    targetDate:
                        new Date(
                            targetMs
                        ),

                    currentDate:
                        this.getDate(),

                    state:
                        this.getStateSummary()
                }
            );


            if (
                wasPlaying &&
                options.resume !== false
            ) {

                this.play();
            }


            return (
                this.getDate()
            );
        }


        /* ====================================================================
           BACKWARD
           ==================================================================== */

        const restoredDate = (
            this.history.restoreBefore(
                targetDate
            )
        );


        if (
            !restoredDate
        ) {

            /*
             * Requested target predates retained history.
             */

            this.events.emit(

                "seekfailed",

                {
                    reason:
                        "no-earlier-snapshot",

                    targetDate:
                        targetDate
                }
            );


            if (
                wasPlaying &&
                options.resume !== false
            ) {

                this.play();
            }


            return null;
        }


        this.currentDate = (
            new Date(
                restoredDate.getTime()
            )
        );


        const minutesForward = (

            targetMs -
            this.currentDate.getTime()

        ) /
        60000;


        if (
            minutesForward >
            0
        ) {

            /*
             * During replay we normally avoid duplicating all historical
             * observations/snapshots that already exist.

             * The simulation state itself is still recomputed.
             */

            this.advanceMinutes(

                minutesForward,

                {
                    recordHistory:
                        options.rebuildHistory ===
                        true,

                    emitEvent:
                        false
                }
            );
        }


        /*
         * Diagnostic fields are explicitly recalculated at requested time.
         */

        this.atmosphere.updateDerivedFields(
            this.currentDate
        );


        this.simulationAccumulatorMs = 0;


        this.events.emit(

            "seek",

            {
                direction:
                    "backward",

                restoredFrom:
                    restoredDate,

                targetDate:
                    targetDate,

                currentDate:
                    this.getDate(),

                state:
                    this.getStateSummary()
            }
        );


        if (
            wasPlaying &&
            options.resume !== false
        ) {

            this.play();
        }


        return (
            this.getDate()
        );
    }


    /* ========================================================================
       SEEK RELATIVE
       ======================================================================== */

    seekMinutes(
        minutes
    ) {

        const target = new Date(

            this.currentDate.getTime() +

            Number(
                minutes
            ) *
            60000
        );


        return this.seek(
            target
        );
    }


    seekHours(
        hours
    ) {

        return this.seekMinutes(

            Number(
                hours
            ) *
            60
        );
    }


    seekDays(
        days
    ) {

        return this.seekMinutes(

            Number(
                days
            ) *
            1440
        );
    }


    /* ========================================================================
       WEATHER SAMPLE
       ======================================================================== */

    sample(
        lat,
        lon
    ) {

        return this.atmosphere.sample(

            Number(
                lat
            ),

            Number(
                lon
            )
        );
    }


    /* ========================================================================
       CLIMATE SAMPLE
       ======================================================================== */

    sampleClimate(
        lat,
        lon,
        date = null
    ) {

        const climateDate = (
            date
                ? asDate(
                    date
                )
                : this.currentDate
        );


        return global.EuropaClimate.getBaselineTemperature(

            Number(
                lat
            ),

            Number(
                lon
            ),

            climateDate,

            {
                terrain:
                    this.terrain
            }
        );
    }


    /* ========================================================================
       WEATHER STATIONS
       ======================================================================== */

    addStation(
        lat,
        lon,
        name = null
    ) {

        const station = (
            this.history.addStation(

                lat,

                lon,

                name
            )
        );


        /*
         * Immediately give a newly-created station one real observation at
         * current simulation time.
         */

        const sample = (
            this.atmosphere.sample(

                station.lat,

                station.lon
            )
        );


        station.addObservation({

            timeMs:
                this.currentDate.getTime(),

            date:
                this.getDate(),


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


        this.events.emit(

            "stationadd",

            {
                station
            }
        );


        return station;
    }


    removeStation(
        stationId
    ) {

        this.history.removeStation(
            stationId
        );


        this.events.emit(

            "stationremove",

            {
                stationId
            }
        );
    }


    getStation(
        stationId
    ) {

        return this.history.getStation(
            stationId
        );
    }


    getStations() {

        return [
            ...this.history.stations
        ];
    }


    sampleStationAt(
        stationId,
        date
    ) {

        return this.history.sampleStationAt(

            stationId,

            date
        );
    }


    /* ========================================================================
       STEERING ARROWS

       These affect synoptic FLOW guidance.

       They do NOT directly assign temperature or weather.
       ======================================================================== */

    addSteeringArrow(
        sourceLat,
        sourceLon,
        targetLat,
        targetLon,
        options = {}
    ) {

        if (
            !this.synoptic ||
            typeof this.synoptic.addArrow !==
            "function"
        ) {

            return null;
        }


        const arrow = (
            this.synoptic.addArrow(

                sourceLat,

                sourceLon,

                targetLat,

                targetLon,

                options
            )
        );


        this.events.emit(

            "forcingchange",

            {
                action:
                    "add",

                arrow
            }
        );


        return arrow;
    }


    removeSteeringArrow(
        arrowId
    ) {

        if (
            !this.synoptic ||
            typeof this.synoptic.removeArrow !==
            "function"
        ) {

            return false;
        }


        const result = (
            this.synoptic.removeArrow(
                arrowId
            )
        );


        this.events.emit(

            "forcingchange",

            {
                action:
                    "remove",

                arrowId
            }
        );


        return result;
    }


    clearSteeringArrows() {

        if (
            this.synoptic &&
            typeof this.synoptic.clearArrows ===
            "function"
        ) {

            this.synoptic.clearArrows();
        }


        this.events.emit(

            "forcingchange",

            {
                action:
                    "clear"
            }
        );
    }


    getSteeringArrows() {

        return (
            this.synoptic &&
            Array.isArray(
                this.synoptic.arrows
            )
                ? [
                    ...this.synoptic.arrows
                ]
                : []
        );
    }


    /* ========================================================================
       SYNOPTIC SYSTEM CREATION
       ======================================================================== */

    createLow(
        options = {}
    ) {

        if (
            !this.synoptic ||
            typeof this.synoptic.createLow !==
            "function"
        ) {

            return null;
        }


        const system = (
            this.synoptic.createLow(
                options
            )
        );


        this.events.emit(

            "systemchange",

            {
                action:
                    "create-low",

                system
            }
        );


        return system;
    }


    createHigh(
        options = {}
    ) {

        if (
            !this.synoptic ||
            typeof this.synoptic.createHigh !==
            "function"
        ) {

            return null;
        }


        const system = (
            this.synoptic.createHigh(
                options
            )
        );


        this.events.emit(

            "systemchange",

            {
                action:
                    "create-high",

                system
            }
        );


        return system;
    }


    getSystems() {

        return (
            this.synoptic &&
            Array.isArray(
                this.synoptic.systems
            )
                ? [
                    ...this.synoptic.systems
                ]
                : []
        );
    }


    /* ========================================================================
       SAVE SNAPSHOT MANUALLY
       ======================================================================== */

    saveSnapshot() {

        this.history.record(

            this.currentDate,

            true
        );


        this.events.emit(

            "snapshot",

            {
                date:
                    this.getDate(),

                history:
                    this.history.getInfo()
            }
        );
    }


    /* ========================================================================
       HISTORY INFORMATION
       ======================================================================== */

    getHistoryInfo() {

        return (
            this.history.getInfo()
        );
    }


    /* ========================================================================
       RESET

       Rebuilds all dynamic weather components from the selected date.

       Terrain itself is retained because geography is static.
       ======================================================================== */

    reset(
        dateInput = null,
        seed = null
    ) {

        const wasPlaying = (
            this.playing
        );


        this.pause();


        const date = (
            dateInput !== null
                ? asDate(
                    dateInput
                )
                : new Date(
                    this.initialDate.getTime()
                )
        );


        if (
            !validDate(
                date
            )
        ) {

            throw new Error(
                "EuropaWeather.reset(): invalid date."
            );
        }


        if (
            seed !== null &&
            Number.isFinite(
                Number(
                    seed
                )
            )
        ) {

            this.seed = (
                Number(
                    seed
                )
            );
        }


        this.currentDate = (
            new Date(
                date.getTime()
            )
        );


        this.ocean = (
            new global.EuropaOcean.Ocean(

                this.terrain,

                this.currentDate
            )
        );


        this.synoptic = (
            new global.EuropaSynoptic(

                this.terrain,

                this.seed
            )
        );


        this.atmosphere = (
            new global.EuropaAtmosphere(

                this.terrain,

                this.ocean,

                this.synoptic,

                this.currentDate
            )
        );


        this.physics = (
            new global.EuropaPhysics(

                this.terrain,

                this.ocean,

                this.synoptic,

                this.atmosphere
            )
        );


        this.history = (
            new global.EuropaHistory(

                this.atmosphere,

                this.ocean,

                this.synoptic,

                this.terrain
            )
        );


        this.history.record(

            this.currentDate,

            true
        );


        this.totalPhysicsSteps = 0;

        this.simulationAccumulatorMs = 0;


        this.events.emit(

            "reset",

            this.getStateSummary()
        );


        if (
            wasPlaying
        ) {

            this.play();
        }
    }


    /* ========================================================================
       FIELD ACCESS

       Renderer uses this to read direct model arrays without repeatedly calling
       atmosphere.sample() 343,200 times.

       The renderer will interpolate the 195 × 110 physics grid itself onto the
       780 × 440 display.

       This directly avoids the major performance problem from the old weather
       renderer.
       ======================================================================== */

    getFields() {

        const A = (
            this.atmosphere
        );


        return {

            nx:
                this.nx,

            ny:
                this.ny,

            terrain:
                this.terrain,


            temperatureC:
                A.temperatureC,

            climatologyC:
                A.climatologyC,

            anomalyC:
                A.anomalyC,


            pressureHpa:
                A.pressureHpa,


            specificHumidity:
                A.specificHumidity,

            relativeHumidity:
                A.relativeHumidity,


            windU:
                A.windU,

            windV:
                A.windV,

            windSpeed:
                A.windSpeed,

            windDirectionDeg:
                A.windDirectionDeg,


            cloudFraction:
                A.cloudFraction,

            cloudWater:
                A.cloudWater,


            precipRateMmHr:
                A.precipRateMmHr,

            precipPhase:
                A.precipPhase,


            groundTemperatureC:
                A.groundTemperatureC,

            snowDepthCm:
                A.snowDepthCm,

            surfaceWetness:
                A.surfaceWetness,


            verticalMotion:
                A.verticalMotion,

            convergence:
                A.convergence,

            frontStrength:
                A.frontStrength,

            boundaryLayerMixing:
                A.boundaryLayerMixing,

            stability:
                A.stability,


            airMassTracer:
                A.airMassTracer,

            airMassAgeHours:
                A.airMassAgeHours,

            lastSeaContactHours:
                A.lastSeaContactHours,

            lastLandContactHours:
                A.lastLandContactHours,


            sst:
                this.ocean
                    ? this.ocean.sst
                    : null
        };
    }


    /* ========================================================================
       CONTROLLER STATE SUMMARY
       ======================================================================== */

    getStateSummary() {

        return {

            date:
                this.getDate(),

            timeMs:
                this.currentDate.getTime(),


            playing:
                this.playing,

            timeScale:
                this.timeScale,


            physicsStepMinutes:
                physicsStepMinutes(),

            totalPhysicsSteps:
                this.totalPhysicsSteps,


            systems:
                this.synoptic &&
                Array.isArray(
                    this.synoptic.systems
                )
                    ? this.synoptic.systems.length
                    : 0,

            steeringArrows:
                this.synoptic &&
                Array.isArray(
                    this.synoptic.arrows
                )
                    ? this.synoptic.arrows.length
                    : 0,


            stations:
                this.history
                    ? this.history.stations.length
                    : 0,

            snapshots:
                this.history
                    ? this.history.snapshots.length
                    : 0
        };
    }


    /* ========================================================================
       EVENT API
       ======================================================================== */

    on(
        eventName,
        callback
    ) {

        return this.events.on(
            eventName,
            callback
        );
    }


    off(
        eventName,
        callback
    ) {

        this.events.off(
            eventName,
            callback
        );
    }


    /* ========================================================================
       DESTROY
       ======================================================================== */

    destroy() {

        this.pause();

        this.destroyed = true;

        this.events.clear();


        this.terrain = null;

        this.ocean = null;

        this.synoptic = null;

        this.atmosphere = null;

        this.physics = null;

        this.history = null;
    }


    /* ========================================================================
       NX / NY CONVENIENCE
       ======================================================================== */

    get nx() {

        return (
            this.terrain
                ? this.terrain.nx
                : 0
        );
    }


    get ny() {

        return (
            this.terrain
                ? this.terrain.ny
                : 0
        );
    }
}


/* ============================================================================
   FACTORY

   Allows:

       const weather = EuropaWeather.create({...});

   or:

       const weather = new EuropaWeather.Controller({...});
============================================================================ */

function createWeather(
    options = {}
) {

    return (
        new WeatherController(
            options
        )
    );
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaWeather = Object.freeze({

    version:
        "7.2-modular-controller",

    Controller:
        WeatherController,

    create:
        createWeather
});


global.EuropaWeatherController = (
    WeatherController
);

})(window);
