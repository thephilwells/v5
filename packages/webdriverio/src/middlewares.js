import logger from 'wdio-logger'

const log = logger('webdriverio')

/**
 * This method is an command wrapper for elements that checks if a command is called
 * that wasn't found on the page and automatically waits for it
 *
 * @param  {Function} fn  commandWrap from wdio-sync package (or shim if not running in sync)
 */

/**
 * [elementErrorHandler description]

 * @return {[type]}      [description]
 */
export const elementErrorHandler = (fn) => (commandName, commandFn) => {
    return function (...args) {
        /**
         * wait on element if:
         *  - elementId couldn't be fetched in the first place
         *  - command is not explicit wait command for existence or displayedness
         */
        if (!this.elementId && !commandName.match(/(wait(Until|ForVisible|ForExist)|isExisting)/)) {
            log.debug(
                `command ${commandName} was called on an element ("${this.selector}") ` +
                `that wasn't found, waiting for it...`
            )

            return fn(commandName, () => {
                /**
                 * create new promise so we can apply a custom error message in case waitForExist fails
                 */
                return new Promise((resolve, reject) => this.waitForExist().then(resolve, reject)).then(
                    /**
                     * if waitForExist was successful requery element and assign elementId to the scope
                     */
                    () => {
                        return this.parent.$(this.selector).then((elem) => {
                            this.elementId = elem.elementId
                            return fn(commandName, commandFn).apply(this, args)
                        })
                    },
                    /**
                     * if waitForExist fails throw custom error
                     */
                    () => {
                        throw new Error(`Can't call ${commandName} on element with selector "${this.selector}" because element wasn't found`)
                    }
                )
            }).apply(this)
        }

        /**
         * apply workarounds for unclickable elements if:
         *  - elementId can be fetched
         *  - command to click element would return "not clickable" error
         */
        if (this.elementId && commandName === 'click') {
            return fn(commandName, async () => {
                try {
                    await this.waitForExist()
                    /**
                     * if element is not within viewport, scroll to it
                     */
                    if (!this.isDisplayedInViewport()) {
                        await this.scrollIntoView()
                        /**
                         * Wait for element to be displayed and enabled before passing along click command
                         */
                        this.waitUntil(() => {
                            return (this.isDisplayed() && this.isEnabled())
                        })
                        return fn(commandName, commandFn).apply(this, args)
                    } else {
                        /**
                         * Wait for element to be displayed and enabled before passing along click command
                         */
                        this.waitUntil(() => {
                            return (this.isDisplayed() && this.isEnabled())
                        })
                        return fn(commandName, commandFn).apply(this, args)
                    }
                    /**
                     * If element never becomes clickable, pass along custom error message
                     */
                } catch (err) {
                    throw new Error(`Can't call ${commandName} on element with selector "${this.selector}" because element is not visible and/or not enabled`)
                }
            }).apply(this)
        }
        return fn(commandName, commandFn).apply(this, args)
    }
}

/**
 * handle single command calls from multiremote instances
 */
export const multiremoteHandler = (wrapCommand) => (commandName) => {
    return wrapCommand(commandName, function (...args) {
        const commandResults = this.instances.map((instanceName) => {
            return this[instanceName][commandName](...args)
        })

        return Promise.all(commandResults)
    })
}
