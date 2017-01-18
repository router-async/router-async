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
    constructor(message: string = 'Internal Error', status: number = 500) {
        this.message = message;
        this.status = status;
    }
}

export class Redirect {
    path: string;
    status: number;
    constructor(path: string, status: number = 302) {
        this.path = path;
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
            let resultRoute = {
                path
            };
            if (pattern) resultRoute['pattern'] = pattern;
            if (keys) resultRoute['keys'] = keys;
            if (action) resultRoute['action'] = action;
            if (route.status) resultRoute['status'] = route.status;
            if (route.to) resultRoute['to'] = route.to;
            this.routes.push(resultRoute);
        }
    }
    private matchRoute(path): any {
        for (const route of this.routes) {
            const match = route.pattern.exec(path);
            if (match) {
                return { route, match, error: null };
            }
        }
        return { route: null, match: null, error: new RouterError('Not Found', 404) };
    }
    private async handleError(params) {
        await this.runHooks('error', { ...params });
        return { ...params };
    }

    public async runHooks(hook, options) {
        for (const hooks of this.hooks) {
            if (hooks[hook]) await hooks[hook](options);
        }
    }
    public async match({ path, ctx }) {
        const { pathname } = createLocation(path);
        const redirectHistory = new Map();

        const doMatch = (pathname, status = null, redirect = null) => {
            const { route, match, error } = this.matchRoute(pathname);
            if (error !== null) return { route, match, status: error.status, redirect, error};
            if (route.status) status = route.status;
            // redirect! we need to dive deeper
            if (route.to) {
                if (status === null) status = 302;
                redirect = route.to;
                if (redirectHistory.has(route)) {
                    const error = new RouterError('Circular Redirect', 500);
                    return { route, match, status: error.status, redirect, error };
                } else {
                    redirectHistory.set(route, true);
                    return doMatch(route.to, status, redirect);
                }
            } else {
                if (status === null) status = 200;
                return { route, match, status, redirect, error: null };
            }
        };

        const { route, match, status, redirect, error } = doMatch(pathname);
        if (error !== null) {
            return { route, status, redirect, error, params: null }
        } else {
            let params = {};
            for (let i = 1; i < match.length; i += 1) {
                params[route.keys[i - 1].name] = decodeParam(match[i]);
            }
            return { route, status, redirect, error, params };
        }
    }
    public async run({ path, ctx = new Context() }) {
        const location = createLocation(path);
        const redirectHistory = new Map();

        const doRun = async (path, location, ctx, redirect = null, status = null) => {
            await this.runHooks('start', { path, location, ctx });

            const matchResult = await this.match({ path, ctx });
            const { route, params, error } = matchResult;
            if (redirect === null) {
                redirect = matchResult.redirect;
                status = matchResult.status;
            }
            if (error !== null) return await this.handleError({ path, location, route: null, status: error.status, params: null, redirect: null, result: null, ctx, error });
            await this.runHooks('match', { path, location, route, status, params, redirect, ctx });

            const result = await route.action({ path, location, route, status, params, redirect, ctx });
            if (result instanceof RouterError) return await this.handleError({ path, location, route, status: result.status, params, redirect, result: null, ctx, error: result });
            if (result instanceof Redirect) {
                const status = result.status;
                const redirect = result.path;
                if (redirectHistory.has(route)) {
                    const error = new RouterError('Circular Redirect', 500);
                    return await this.handleError({ path, location, route, status: error.status, params, redirect, result: null, ctx, error });
                } else {
                    redirectHistory.set(route, true);
                    return doRun(redirect, location, ctx, redirect, status);
                }
            }
            await this.runHooks('resolve', { path, location, route, status, params, redirect, result, ctx });

            return { path, location, route, status, params, redirect, result, ctx, error: null };
        };

        return doRun(path, location, ctx);
    }
}
