import * as pathToRegexp from 'path-to-regexp';
import * as queryString from 'query-string';

export const parseQuery = query => queryString.parse(query);
export const stringifyQuery = query => queryString.stringify(query);

//TODO: maybe export location and work with location instead of path
const createLocation = path => {
    const parsedPath = parsePath(path);
    return {
        ...parsedPath,
        // TODO: move query out from location, it still here for backwards compatibility
        query: parseQuery(parsedPath.search)
    };
};

const parsePath = path => {
    let pathname = path || '/';
    let search = '';
    let hash = '';

    const hashIndex = pathname.indexOf('#');
    if (hashIndex !== -1) {
        hash = pathname.substr(hashIndex);
        pathname = pathname.substr(0, hashIndex)
    }

    const searchIndex = pathname.indexOf('?');
    if (searchIndex !== -1) {
        search = pathname.substr(searchIndex);
        pathname = pathname.substr(0, searchIndex)
    }

    return {
        pathname,
        search: search === '?' ? '' : search,
        hash: hash === '#' ? '' : hash
    }
};

function trimSlashes(str) {
    return str.replace(/^\/+|\/+$/g,'');
}

function decodeParam(val) {
    if (val === undefined || val === '') {
        return val;
    }

    try {
        return decodeURIComponent(val);
    } catch (err) {
        return val;
    }
}

// TODO: write correct types
export interface Match {
    length: number,
    [index: number]: string;
}
export interface Key {
    name: string
}
export interface ActionOptions {
    path: string,
    keys: Array<Key>
}
export interface Action {
    (ActionOptions): any
}
export interface Route {
    action: Action,
    keys: Array<Key>;
}

export class RouterError {
    message: string;
    status: number;
    name: string;
    constructor(message: string = 'Internal Error', status: number = 500) {
        this.name = 'RouterError';
        this.message = message;
        this.status = status;
    }
}

export class Context {
    private keys: Object;
    constructor() {
        this.keys = {};
    }
    set(key, value) {
        if (key in this.keys) {
            console.warn(`Key ${key} is already set to context`);
        } else {
            this.keys[key] = value;
        }
    }
    get(key) {
        if (key in this.keys) {
            return this.keys[key];
        } else {
            return null;
        }
    }
}

export class Router {
    private routes: any;
    private hooks: any;
    constructor({ routes, hooks = {} }) {
        this.routes = [];
        this.hooks = hooks;
        if (Array.isArray(routes)) {
            routes = { childs: routes };
        }
        this.walk(routes);
    }
    private walk(route, walkPath = []) {
        if (route.childs) {
            walkPath.push(route);
            for (const child of route.childs) {
                this.walk(child, [...walkPath]);
            }
        } else {
            const fullWalkPath = [...walkPath, route];
            const middlewares = [];
            // concatenate full path
            let path = '';
            for (const step of fullWalkPath) {
                if (step.path) path += `/${trimSlashes(step.path)}`;
            }
            path = `/${trimSlashes(path)}`;
            const keys = [];
            const pattern = pathToRegexp(path, keys);
            // wrap action with middlewares
            let action = route.action ? route.action : null;
            if (action) { // redirect don't have action
                for (const step of walkPath) {
                    if (step.action) middlewares.push(step.action);
                }
                if (middlewares.length) {
                    for (const middleware of middlewares) {
                        action = middleware.bind(null, action)
                    }
                }
            }
            // push result route
            // TODO: check and add only existing properties
            this.routes.push({
                path,
                pattern,
                keys,
                action,
                status: route.status,
                to: route.to
            });
        }
    }
    async runHooks(hook, options) {
        for (const hooks of this.hooks) {
            if (hooks[hook]) await hooks[hook](options);
        }
    }
    matchRoute(path) {
        for (const route of this.routes) {
            const match = route.pattern.exec(path);
            if (match) {
                return { route, match };
            }
        }
        throw new RouterError('Not Found', 404);
    }
    async match({ path, ctx }) {
        const { pathname } = createLocation(path);
        const redirectHistory = new Map();
        let status = 200;
        let redirect = null;
        let route: Route;
        let match: Match;
        //TODO: refactor this shit
        const findRoute = pathname => {
            let result = this.matchRoute(pathname);
            if (result.route.status) status = result.route.status;
            if (result.route.status === 301 || result.route.status === 302) {
                if (redirectHistory.has(result.route)) {
                    throw new RouterError('Circular Redirect', 500);
                } else {
                    redirectHistory.set(result.route, true);
                    redirect = result.route.to;
                    findRoute(result.route.to);
                }
            } else {
                route = result.route;
                match = result.match;
            }
        };
        // TODO: remove try catch?
        try {
            findRoute(pathname);
        } catch (error) {
            return { route: null, status: error.status, params: null, redirect: null, error }
        }
        let params = {};
        for (let i = 1; i < match.length; i += 1) {
            params[route.keys[i - 1].name] = decodeParam(match[i]);
        }
        return { route, status, params, redirect, error: null };
    }
    async resolve({ path, ctx = new Context() }) {
        const location = createLocation(path);
        try {
            const { route, status, params, redirect } = await this.match({ path, ctx });
            const result = await route.action({ path, location, route, status, params, redirect, ctx });
            return { path, location, route, status, params, redirect, result, ctx, error: null };
        } catch (error) {
            if (error.name === 'RouterError') {
                return { path, location, route: null, status: error.status, params: null, redirect: null, result: null, ctx, error };
            } else {
                throw error;
            }
        }
    }
    async run({ path, ctx = new Context() }) {
        const location = createLocation(path);
        // TODO: remove try catch?
        try {
            await this.runHooks('start', { path, location, ctx });
            const { route, status, params, redirect, error } = await this.match({ path, ctx });
            if (error !== null) throw error;
            await this.runHooks('match', { path, location, route, status, params, redirect, ctx });
            const result = await route.action({ path, location, route, status, params, redirect, ctx });
            await this.runHooks('resolve', { path, location, route, status, params, redirect, result, ctx });
            return { path, location, route, status, params, redirect, result, ctx, error: null };
        } catch (error) {
            if (error.name === 'RouterError') {
                await this.runHooks('error', { path, location, route: null, status: error.status, params: null, redirect: null, result: null, ctx, error });
                return { path, location, route: null, status: error.status, params: null, redirect: null, result: null, ctx, error };
            } else {
                throw error;
            }
        }
    }
}
