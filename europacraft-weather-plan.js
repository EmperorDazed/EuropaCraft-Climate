"use strict";

/*
    ============================================================
    EUROPACRAFT WEATHER PLANNER
    FILE 2 OF 3
    europacraft-weather-plan.js
    ============================================================

    PURPOSE

    This file stores the WEATHER YOU AUTHOR.

    It does NOT:
    - generate random weather
    - connect to an API
    - run atmospheric physics
    - contain the Europe land/sea mask
    - calculate climatology

    Those belong in europacraft-weather.js.

    This file is intentionally simple enough that it can also be
    backed up, versioned, inspected and edited manually if needed.

    ============================================================
    PLANNING MODEL
    ============================================================

    Typical workflow:

    1. Work on roughly 1–3 months at once.
    2. Add highs, lows, air masses, fronts and precipitation areas.
    3. Scrub freely through any time.
    4. Mark weather DONE when reviewed.
    5. LOCK it when final.
    6. Locked dates can still be viewed.
    7. The final 12 locked hours remain visible while designing
       the next block so transitions can be checked.
    8. Export deterministic server weather.

    LOCKED MEANS LOCKED.

    The UI will not normally allow an object affecting locked time
    to be changed or deleted.

    ============================================================
*/


window.EuropaWeatherPlan = {

    /*
        File/schema version.

        Increase this only if the structure of this file changes
        incompatibly in the future.
    */
    formatVersion: 1,


    /*
        Human-readable planner version.
    */
    plannerVersion: "1.0",


    /*
        Europe map bounds.

        These match the broad EuropaCraft Europe domain.
        The engine uses these to convert latitude/longitude to map
        coordinates.

        DO NOT change these casually once weather has been authored.
    */
    bounds: {
        north: 74.0,
        south: 30.0,
        west: -26.0,
        east: 52.0
    },


    /*
        ========================================================
        ACTIVE PLANNING BLOCK
        ========================================================

        Default:
            1 October 2026
            through
            31 December 2026

        This gives you a full three-month block.

        It can later be changed through the planner itself.

        Times are stored in UTC internally.

        Civil national time zones do NOT change the weather clock.
        They only change how local clocks are displayed elsewhere.
    */
    planningBlock: {
        start: "2026-10-01T00:00:00Z",
        end: "2026-12-31T23:59:59Z"
    },


    /*
        Number of already-locked hours to show immediately before
        the editable planning block.

        You wanted 12 hours.
    */
    lockedHistoryHours: 12,


    /*
        ========================================================
        COMPLETION STATE
        ========================================================

        doneThrough:
            Weather through this instant has been reviewed but is
            still editable.

        lockedThrough:
            Weather through this instant is final and read-only.

        null means nothing has yet been marked done / locked.
    */
    completion: {
        doneThrough: null,
        lockedThrough: null
    },


    /*
        ========================================================
        GLOBAL PLAN INFORMATION
        ========================================================
    */
    metadata: {
        title: "EuropaCraft Weather Plan",
        description:
            "Deterministic manually-authored European weather.",
        author: "EuropaCraft",
        created: "2026-09-01T00:00:00Z",
        lastModified: "2026-09-01T00:00:00Z"
    },


    /*
        ========================================================
        PLAN SETTINGS
        ========================================================

        These are intentionally few.

        The actual meteorological behaviour belongs in the engine.
    */
    settings: {

        /*
            smooth:
                weather systems interpolate smoothly between their
                start and end locations.

            linear:
                same idea but completely linear.

            "smooth" is recommended.
        */
        movementInterpolation: "smooth",

        /*
            Broad climatology is always supplied by the permanent
            EuropaCraft engine.

            Weather objects modify that baseline.
        */
        useClimatologyBaseline: true,

        /*
            Automatically determine rain/sleet/snow from local
            temperature unless an authored precipitation area
            explicitly overrides the phase.
        */
        automaticPrecipitationPhase: true,

        /*
            Snow persists between weather events and can melt or
            accumulate in the deterministic server export.
        */
        snowAccumulationEnabled: true,

        /*
            When no authored synoptic object affects a location,
            return to climatological conditions rather than inventing
            procedural weather.
        */
        fallbackMode: "climatology"
    },


    /*
        ========================================================
        WEATHER OBJECTS
        ========================================================

        This is the main editable part of the plan.

        It intentionally begins empty.

        Use the planner to add objects instead of hand-writing them.

        Supported object types:

            "high"
            "low"
            "airmass"
            "coldfront"
            "warmfront"
            "precip"

        The engine may add more types later without requiring the
        overall architecture to change.
    */
    objects: [],


    /*
        ========================================================
        OPTIONAL MANUAL LOCAL OVERRIDES
        ========================================================

        These are for exceptional cases where you want an exact
        result in an area regardless of the normal derived weather.

        Most weather should NOT need these.

        Example use:
            exact snowfall around Kent for a few hours
            exact fog in Pomerania
            manually force a warm pocket
            exact snow-depth correction

        The planner UI in the first version does not require these,
        but the structure is included now so the export format never
        needs to be redesigned merely to support them.
    */
    overrides: [],


    /*
        ========================================================
        LOCK SNAPSHOTS
        ========================================================

        When a period is locked, the engine can store resolved
        boundary conditions here.

        This prevents future edits immediately after the locked
        period from subtly changing the already-locked result through
        interpolation.

        Leave this empty manually.
    */
    lockSnapshots: [],


    /*
        ========================================================
        NOTES
        ========================================================

        Pure planning notes.

        They are ignored by Minecraft.
    */
    notes: [
        {
            time: "2026-10-01T00:00:00Z",
            text:
                "Initial October–December 2026 planning block. Weather not yet authored."
        }
    ]
};


/*
    ============================================================
    OBJECT CREATION HELPERS
    ============================================================

    These helpers keep newly-created objects consistent.

    The planner engine calls these functions.

    They are kept in this file because they describe the plan format,
    not the meteorological engine.
*/


window.EuropaWeatherPlan.createObject = function (
    type,
    latitude,
    longitude,
    time
) {

    const now =
        time ||
        window.EuropaWeatherPlan.planningBlock.start;

    const later =
        new Date(
            new Date(now).getTime() +
            24 * 60 * 60 * 1000
        ).toISOString();

    const id =
        "wx_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8);

    const common = {
        id: id,

        type: type,

        name: defaultName(type),

        startTime: now,
        endTime: later,

        start: {
            lat: clamp(latitude, 30, 74),
            lon: clamp(longitude, -26, 52)
        },

        end: {
            lat: clamp(latitude, 30, 74),
            lon: clamp(longitude, -26, 52)
        },

        radiusKm: defaultRadius(type),

        strength: defaultStrength(type),

        notes: ""
    };


    if (type === "airmass") {

        common.airmass = "atlantic";

        /*
            Temperature anomaly in °C relative to climatology.

            This is deliberately direct and understandable.

            Examples:
                -8 = strong cold anomaly
                +6 = strong warm anomaly
        */
        common.temperatureAnomaly = 0;

        /*
            Moisture:
                0   = very dry
                1   = extremely moist
        */
        common.moisture = 0.65;
    }


    if (
        type === "coldfront" ||
        type === "warmfront"
    ) {

        common.angle = 0;
        common.lengthKm = 700;
        common.widthKm = 120;

        common.temperatureContrast =
            type === "coldfront"
                ? 5
                : 4;

        common.precipitationRate =
            type === "coldfront"
                ? 3.0
                : 2.0;

        common.cloudCover = 95;
    }


    if (type === "precip") {

        common.precipitationPhase = "auto";
        common.precipitationRate = 2.0;
        common.cloudCover = 100;

        /*
            Shape is circular/elliptical in version 1.

            Later this can become polygonal without changing the
            rest of the planner.
        */
        common.axisRatio = 0.7;
        common.angle = 0;
    }


    if (type === "high") {

        /*
            strength is pressure anomaly in hPa.
        */
        common.strength = 18;

        common.centralPressure = 1030;
    }


    if (type === "low") {

        /*
            strength is negative pressure anomaly in hPa.
        */
        common.strength = -22;

        common.centralPressure = 985;
    }


    return common;
};


/*
    ============================================================
    CLONE OBJECT
    ============================================================
*/

window.EuropaWeatherPlan.cloneObject = function (object) {

    const clone =
        JSON.parse(
            JSON.stringify(object)
        );

    clone.id =
        "wx_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8);

    clone.name =
        object.name
            ? object.name + " Copy"
            : defaultName(object.type) + " Copy";

    return clone;
};


/*
    ============================================================
    BASIC VALIDATION
    ============================================================
*/

window.EuropaWeatherPlan.validate = function () {

    const errors = [];

    const plan =
        window.EuropaWeatherPlan;


    if (
        !plan.bounds ||
        !Number.isFinite(plan.bounds.north) ||
        !Number.isFinite(plan.bounds.south) ||
        !Number.isFinite(plan.bounds.west) ||
        !Number.isFinite(plan.bounds.east)
    ) {
        errors.push(
            "Map bounds are invalid."
        );
    }


    const start =
        Date.parse(plan.planningBlock.start);

    const end =
        Date.parse(plan.planningBlock.end);


    if (!Number.isFinite(start)) {
        errors.push(
            "Planning block start is invalid."
        );
    }


    if (!Number.isFinite(end)) {
        errors.push(
            "Planning block end is invalid."
        );
    }


    if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end <= start
    ) {
        errors.push(
            "Planning block end must be after its start."
        );
    }


    if (!Array.isArray(plan.objects)) {
        errors.push(
            "Weather objects must be an array."
        );
    }


    if (!Array.isArray(plan.overrides)) {
        errors.push(
            "Overrides must be an array."
        );
    }


    if (!Array.isArray(plan.lockSnapshots)) {
        errors.push(
            "Lock snapshots must be an array."
        );
    }


    if (Array.isArray(plan.objects)) {

        const ids = new Set();

        for (const object of plan.objects) {

            if (!object || typeof object !== "object") {
                errors.push(
                    "A weather object is invalid."
                );
                continue;
            }


            if (!object.id) {
                errors.push(
                    "A weather object has no ID."
                );
            }
            else if (ids.has(object.id)) {
                errors.push(
                    "Duplicate weather object ID: " +
                    object.id
                );
            }
            else {
                ids.add(object.id);
            }


            if (
                ![
                    "high",
                    "low",
                    "airmass",
                    "coldfront",
                    "warmfront",
                    "precip"
                ].includes(object.type)
            ) {
                errors.push(
                    "Unknown weather object type: " +
                    String(object.type)
                );
            }


            const objectStart =
                Date.parse(object.startTime);

            const objectEnd =
                Date.parse(object.endTime);


            if (
                !Number.isFinite(objectStart) ||
                !Number.isFinite(objectEnd)
            ) {
                errors.push(
                    "Invalid time on object " +
                    object.id
                );
            }
            else if (objectEnd <= objectStart) {
                errors.push(
                    "Object ends before it starts: " +
                    object.id
                );
            }
        }
    }


    return {
        valid: errors.length === 0,
        errors: errors
    };
};


/*
    ============================================================
    LOCK HELPERS
    ============================================================
*/


window.EuropaWeatherPlan.isTimeLocked = function (time) {

    const locked =
        window.EuropaWeatherPlan.completion.lockedThrough;

    if (!locked) {
        return false;
    }

    const t =
        typeof time === "number"
            ? time
            : Date.parse(time);

    const lockT =
        Date.parse(locked);

    return (
        Number.isFinite(t) &&
        Number.isFinite(lockT) &&
        t <= lockT
    );
};


window.EuropaWeatherPlan.objectTouchesLockedTime = function (object) {

    if (
        !object ||
        !window.EuropaWeatherPlan.completion.lockedThrough
    ) {
        return false;
    }

    const start =
        Date.parse(object.startTime);

    const locked =
        Date.parse(
            window.EuropaWeatherPlan.completion.lockedThrough
        );

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(locked)
    ) {
        return false;
    }

    /*
        If the object starts at or before the lock boundary,
        modifying it could alter locked weather.
    */
    return start <= locked;
};


/*
    ============================================================
    SERIALISATION
    ============================================================

    Functions are removed automatically when JSON.stringify is used.

    This function returns only persistent plan data.
*/


window.EuropaWeatherPlan.toSerializable = function () {

    const plan =
        window.EuropaWeatherPlan;

    return {

        formatVersion:
            plan.formatVersion,

        plannerVersion:
            plan.plannerVersion,

        bounds:
            deepCopy(plan.bounds),

        planningBlock:
            deepCopy(plan.planningBlock),

        lockedHistoryHours:
            plan.lockedHistoryHours,

        completion:
            deepCopy(plan.completion),

        metadata:
            deepCopy(plan.metadata),

        settings:
            deepCopy(plan.settings),

        objects:
            deepCopy(plan.objects),

        overrides:
            deepCopy(plan.overrides),

        lockSnapshots:
            deepCopy(plan.lockSnapshots),

        notes:
            deepCopy(plan.notes)
    };
};


/*
    ============================================================
    LOAD SERIALISED PLAN
    ============================================================
*/

window.EuropaWeatherPlan.loadSerializable = function (data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        throw new Error(
            "Weather plan data is not valid."
        );
    }


    const target =
        window.EuropaWeatherPlan;


    const replaceable = [
        "formatVersion",
        "plannerVersion",
        "bounds",
        "planningBlock",
        "lockedHistoryHours",
        "completion",
        "metadata",
        "settings",
        "objects",
        "overrides",
        "lockSnapshots",
        "notes"
    ];


    for (const key of replaceable) {

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                key
            )
        ) {
            target[key] =
                deepCopy(data[key]);
        }
    }


    const validation =
        target.validate();

    if (!validation.valid) {

        throw new Error(
            validation.errors.join("\n")
        );
    }


    return true;
};


/*
    ============================================================
    INTERNAL SMALL HELPERS
    ============================================================
*/


function defaultName(type) {

    switch (type) {

        case "high":
            return "High Pressure";

        case "low":
            return "Low Pressure";

        case "airmass":
            return "Air Mass";

        case "coldfront":
            return "Cold Front";

        case "warmfront":
            return "Warm Front";

        case "precip":
            return "Precipitation Area";

        default:
            return "Weather Object";
    }
}


function defaultRadius(type) {

    switch (type) {

        case "high":
            return 900;

        case "low":
            return 700;

        case "airmass":
            return 850;

        case "coldfront":
        case "warmfront":
            return 250;

        case "precip":
            return 300;

        default:
            return 400;
    }
}


function defaultStrength(type) {

    switch (type) {

        case "high":
            return 18;

        case "low":
            return -22;

        case "airmass":
            return 0;

        case "coldfront":
            return 5;

        case "warmfront":
            return 4;

        case "precip":
            return 2;

        default:
            return 0;
    }
}


function clamp(value, min, max) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return min;
    }

    return Math.max(
        min,
        Math.min(
            max,
            number
        )
    );
}


function deepCopy(value) {

    return JSON.parse(
        JSON.stringify(value)
    );
}


/*
    ============================================================
    INITIAL SANITY CHECK
    ============================================================
*/


(function validateInitialPlan() {

    const result =
        window.EuropaWeatherPlan.validate();

    if (!result.valid) {

        console.error(
            "EuropaCraft weather-plan validation failed:",
            result.errors
        );
    }
    else {

        console.info(
            "EuropaCraft Weather Plan loaded.",
            {
                version:
                    window.EuropaWeatherPlan.plannerVersion,

                planningBlock:
                    window.EuropaWeatherPlan.planningBlock,

                weatherObjects:
                    window.EuropaWeatherPlan.objects.length
            }
        );
    }

})();
