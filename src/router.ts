import * as pathToRegexp from 'path-to-regexp';

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
    message: any;
    code: any;
    name: any;
    constructor(message, code) {
        this.name = 'RouterError';
        this.message = message;
        this.code = code;
    }
}

export default class Router {
    private routes: any;
    private hooks: any;
    constructor({ routes, hooks }) {
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
                this.walk(child, walkPath);
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
                        action = middleware.bind(null, {next: action, route})
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
        const redirectHistory = new Map();
        let status = 200;
        let redirect = null;
        let route: Route;
        let match: Match;
        //TODO: refactor this shit
        const findRoute = path => {
            let result = this.matchRoute(path);
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
        findRoute(path);
        let params = {};
        for (let i = 1; i < match.length; i += 1) {
            params[route.keys[i - 1].name] = decodeParam(match[i]);
        }
        return { route, status, params, redirect };
    }
    async resolve({ path, ctx = {} }) {
        await this.runHooks('start', { path, ctx });
        const { route, status, params, redirect } = await this.match({ path, ctx });
        await this.runHooks('match', { path, route, status, params, redirect, ctx });
        const result = await route.action({ path, route, status, params, redirect, ctx });
        await this.runHooks('resolve', { path, route, status, params, redirect, result, ctx });
        return { path, route, status, params, redirect, result, ctx };
    }
}
