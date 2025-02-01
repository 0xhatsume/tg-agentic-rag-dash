import createDebug from 'debug';

class TgAgenticRagLogger {
    private debug = createDebug('bot:dev');
    private error = createDebug('bot:error');
    private info = createDebug('bot:info');
    private success = createDebug('bot:success');
    private warn = createDebug('bot:warn');

    public logDebug(...args: unknown[]): void {
        this.debug(args.join(' '));
    }

    public logError(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.error(args.join(' '));
        } else {
            console.error('❌', args.join(' '));
        }
    }

    public logInfo(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.info(args.join(' '));
        } else {
            console.log('ℹ️', args.join(' '));
        }
    }

    public logSuccess(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.success(args.join(' '));
        } else {
            console.log('✅', args.join(' '));
        }
    }

    public logWarn(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.warn(args.join(' '));
        } else {
            console.warn('⚠️', args.join(' '));
        }
    }
}

export const tgAgenticRagLogger = new TgAgenticRagLogger();

export default tgAgenticRagLogger;