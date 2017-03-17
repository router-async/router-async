import * as pathToRegexp from 'path-to-regexp';
import * as queryString from 'query-string';

export const parseQuery = (query: string) => queryString.parse(query);
export const stringifyQuery = (query: Object) => queryString.stringify(query);

//TODO: maybe export location and work with location instead of path
const createLocation = (path: string): Location => {
    const parsedPath = parsePath(path);
    return {
        ...parsedPath,
        // TODO: move query out from location, it still here for backwards compatibility
        query: parseQuery(parsedPath.search)
    };
};

const parsePath = (path: string) => {
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

function trimSlashes(str: string) {
    return str.replace(/^\/+|\/+$/g,'');
}

function decodeParam(val: undefined|string) {
    if (val === undefined || val === '') {
        return val;
    }

    try {
        return decodeURIComponent(val);
    } catch (err) {
        return val;
    }
}

export interface Object {
    [index: string]: any,
    // TODO: fix types
    error?: any,
    status?: any;
}
export interface RootRoute {
    path?: string;
    action?: Action|Middleware;
    childs: Array<RawRoute>;
    status?: number;
    to?: never;
}
export interface RawRoute {
    path: string;
    action?: Action|Middleware;
    childs?: Array<RawRoute>;
    to?: string;
    status?: number;
    [index: string]: any;
}
export interface Route {
    path: string;
    action?: Action|Middleware;
    pattern: RegExp;
    keys?: Array<pathToRegexp.Key>;
    status?: number;
    to?: string;
    [index: string]: any;
}
export interface Action {
    (options: ActionOptions): any;
}
export interface Middleware {
    (next: Action|Middleware, options: ActionOptions): any;
}
export interface ActionOptions {
    path: string,
    location: Location,
    route: Route,
    status: number,
    params: Object,
    redirect: string|null,
    ctx: Context;
}
export interface Location {
    pathname: string,
    search: string,
    hash: string,
    query: Object
}
export interface RouterResult {
    path: string,
    location: Location,
    route: Route,
    status: number,
    params: Object,
    redirect: string|null,
    result: any,
    ctx: Context,
    error: null|RouterError;
}

export class RouterError {
    public message: string;
    public status: number;
    constructor(message: string = 'Internal Error', status: number = 500) {
        this.message = message;
        this.status = status;
    }
}

export class DynamicRedirect {
    public path: string;
    public status: number;
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
    set(key: string, value: any) {
        if (key in this.keys) {
            // TODO: shows in tests in redirects, make more smart way
            // console.warn(`Key ${key} is already set to context`);
        } else {
            this.keys[key] = value;
        }
    }
    get(key: string) {
        if (key in this.keys) {
            return this.keys[key];
        } else {
            return null;
        }
    }
}

export class Transition {
    public isCancelled: boolean = false;
    private router: Router;
    constructor(router: Router) {
        this.router = router;
    }
    public cancel() {
        this.isCancelled = true;
    }
    public async runOrResolve(path: string, ctx: Context, isHooks: boolean):Promise<Object> {
        const location = createLocation(path);
        const redirectHistory = new Map();

        const doRunOrResolve = async (path: string, location: Object, ctx: Context, redirect: string|null = null, status: number|null = null):Promise<Object> => {
            const resultStartHooks = await this.router.runHooks('start', this, { path, location, ctx }, isHooks);
            if (resultStartHooks !== null) return resultStartHooks;

            const matchResult = await this.router.match({ path, ctx });
            const { route, params, error } = matchResult;
            if (redirect === null) {
                redirect = matchResult.redirect;
                status = matchResult.status;
            }
            if (error !== null) return await this.router.handleError({ path, location, route: null, status: error.status, params: null, redirect: null, result: null, ctx, error }, this, isHooks);
            const resultMatchHooks = await this.router.runHooks('match', this, { path, location, route, status, params, redirect, ctx }, isHooks);
            if (resultMatchHooks !== null) return resultMatchHooks;

            let result = null;
            if (!this.isCancelled) result = await route.action({ path, location, route, status, params, redirect, ctx });
            if (result instanceof RouterError) return await this.router.handleError({ path, location, route, status: result.status, params, redirect, result: null, ctx, error: result }, this, isHooks);
            if (result instanceof DynamicRedirect) {
                const status = result.status;
                const redirect = result.path;
                if (redirectHistory.has(route)) {
                    const error = new RouterError('Circular Redirect', 500);
                    return await this.router.handleError({ path, location, route, status: error.status, params, redirect, result: null, ctx, error }, this, isHooks);
                } else {
                    redirectHistory.set(route, true);
                    return doRunOrResolve(redirect, location, ctx, redirect, status);
                }
            }
            const resolveMatchHooks = await this.router.runHooks('resolve', this, { path, location, route, status, params, redirect, result, ctx }, isHooks);
            if (resolveMatchHooks !== null) return resolveMatchHooks;

            return { path, location, route, status, params, redirect, result, ctx, error: null };
        };

        return doRunOrResolve(path, location, ctx);
    }
}

export class Router {
    private routes: Array<Route>;
    private hooks: any; // TODO: correct type
    private complete: Function;
    public isRunning: boolean = false;
    public currentTransition: Transition;
    constructor({ routes, hooks = {} }: { routes: RootRoute|Array<RawRoute>, hooks?: Object }) {
        this.routes = [];
        this.hooks = hooks;
        if (Array.isArray(routes)) {
            routes = { childs: routes };
        }
        this.walk(routes);
    }
    private walk(route: RootRoute|RawRoute, walkPath: Array<RootRoute|RawRoute> = []) {
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
            const keys: Array<pathToRegexp.Key> = [];
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
            let resultRoute: Route = {
                ...route,
                path,
                pattern
            };
            if (keys) resultRoute['keys'] = keys;
            if (action) resultRoute['action'] = action;
            // if (route.status) resultRoute['status'] = route.status;
            // if (route.to) resultRoute['to'] = route.to;
            this.routes.push(resultRoute);
        }
    }
    private matchRoute(path: string): Object {
        for (const route of this.routes) {
            const match = route.pattern.exec(path);
            if (match) {
                return { route, match, error: null };
            }
        }
        return { route: null, match: null, error: new RouterError('Not Found', 404) };
    }
    private async checkIsRunning(path: string, ctx: Context, isHook: boolean) {
        if (this.isRunning === true) {
            return new Promise(resolve => resolve({ path, location: null, route: null, status: 500, params: null, redirect: null, result: null, ctx, error: new RouterError('Already running', 500) }));
        } else {
            this.currentTransition = new Transition(this);
            return new Promise(async resolve => {
                this.complete = resolve;
                this.isRunning = true;
                const result = await this.currentTransition.runOrResolve(path, ctx, isHook);
                this.isRunning = false;
                resolve(result);
            })
        }
    }
    public async handleError(params: Object, transition: Transition, isHooks: boolean) {
        if (isHooks) await this.runHooks('error', transition, { ...params });
        return { ...params };
    }
    public async runHooks(hook: string, transition: Transition, options: Object = { ctx: new Context }, isHooks: boolean = true) {
        if (isHooks) {
            for (const hooks of this.hooks) {
                if (hooks[hook]) {
                    if (transition instanceof Transition && !transition.isCancelled) {
                        const result = await hooks[hook](options);
                        if (result instanceof RouterError) {
                            options.error = result;
                            options.status = result.status;
                            // TODO: RouterError in error hook can cause BOOM!
                            return await this.handleError(options, transition, isHooks);
                        }
                    }
                }
            }
        }
        return null;
    }
    public async match({ path, ctx }: { path: string, ctx: Context }) {
        const { pathname } = createLocation(path);
        const redirectHistory = new Map();

        const doMatch = (pathname: string, status: number|null = null, redirect: string|null = null): Object => {
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
            let params: Object = {};
            for (let i = 1; i < match.length; i += 1) {
                params[route.keys[i - 1].name] = decodeParam(match[i]);
            }
            return { route, status, redirect, error, params };
        }
    }
    public cancel(isHook: boolean = true) {
        if (this.currentTransition !== null) {
            this.currentTransition.cancel();
            if (isHook) {
                for (const hooks of this.hooks) {
                    if (hooks['cancel']) {
                        hooks['cancel']();
                    }
                }
            }
            this.complete({ error: new RouterError('Cancelled', 500) });
            this.isRunning = false;
        } else {
            // TODO: debug nothing to cancel
        }
    }
    // without hooks
    public resolve({ path, ctx = new Context() }: { path: string, ctx?: Context }):Promise<RouterResult> {
        return this.checkIsRunning(path, ctx, false);
    }
    // with hooks
    public run({ path, ctx = new Context() }: { path: string, ctx?: Context }):Promise<RouterResult> {
        return this.checkIsRunning(path, ctx, true);
    }
}
