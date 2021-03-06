/** @format */

/**
 * External dependencies
 */
import { reduce } from 'lodash';

/**
 * Internal dependencies
 */

import { combineReducers } from 'state/utils';
import { POST_REVISION_AUTHORS_RECEIVE } from 'state/action-types';

/**
 * Tracks all known user objects, indexed by user ID.
 *
 * @param  {Object} state  Current state
 * @param  {Object} action Action payload
 * @return {Object}        Updated state
 */
export function items( state = {}, action ) {
	switch ( action.type ) {
		case POST_REVISION_AUTHORS_RECEIVE:
			return reduce(
				action.users,
				( newState, user ) => {
					if ( newState === state ) {
						newState = { ...state };
					}
					newState[ user.ID ] = user;
					return newState;
				},
				state
			);
	}

	return state;
}

export default combineReducers( {
	items,
} );
